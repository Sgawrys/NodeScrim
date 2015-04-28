var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var config = require('./config');
var session = require('express-session');
var oceanWrapper = require('do-wrapper');
var rcon = require('srcds-rcon');
var ssh = require('sequest');
var fs = require('fs');
var passport = require('passport'),
	SteamStrategy = require('passport-steam').Strategy;

var MAX_CLIENT_CONN = 2;
var ROOM_ID_LENGTH = 5;
var SELECTION_TIME_LIMIT = 20;

//Constructor for making Digital Ocean requests.
var digitalOcean = new oceanWrapper(config.digitalOceanAPIKey, config.digitalOceanPerPage);

//Associative array containing a room ID and room count of clients connected.
var rooms = [];
//Associative array containing a room ID mapped to an array of client objects.
var users = [];
//Ongoing games array
var games = [];

//Namespace for multi-room chat
var chat = io.of('/chat');

//Use Jade templating engine, Passport, and Express Sessions
app.set('view engine', 'ejs')
app.use(express.static(__dirname+"/assets/"));
app.use(bodyParser.json({strict:false}));
app.use(bodyParser.urlencoded({extended: true}));
app.use(session({
	secret : config.sessionSecret,
	resave: false,
	saveUninitialized: true
	})
);
app.use(passport.initialize());
app.use(passport.session());

//Passport serialization for storing user information within sessions.
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

//SteamStrategy as defined under passport-steam, API key is stored in config.js .
passport.use(new SteamStrategy({
	returnURL: 'http://localhost:8080/auth/return',
	realm:'http://localhost:8080/',
	apiKey: config.steamAPIKey
},
	function(identifier, profile, done) {
		process.nextTick(function () {
			profile.identifier = identifier;
			return done(null, profile);
		});
	}
));

app.get('/', function(req, res) {
	res.render('index', {
		displayName : null,
		id : null,
		photo_s : null,
		photo_m : null,
		photo_l : null
	});
});

app.get('/room/:roomId',
	ensureAuthenticated,
	function(req, res) {
		console.log("Room ID is : " + req.params['roomId']);

		var player = new Client(req.user.displayName,
			req.user.id,
			req.user.photos[0].value,
			req.user.photos[1].value,
			req.user.photos[2].value);

		player.joinRoom(req.params['roomId']);

		if(users[req.params['roomId']] === undefined) {
			users[req.params['roomId']] = [];
		}

		users[req.params['roomId']].push(player);

		res.render('room', { 
			displayName : req.user.displayName,
			id : req.user.id,
			photo_s : req.user.photos[0].value,
			photo_m : req.user.photos[1].value,
			photo_l : req.user.photos[2].value
		});
	}
);

//Redirection to home page with new user information to display.
app.get('/login', ensureAuthenticated,
	function(req, res) {
		res.render('index', { 
			displayName : req.user.displayName,
			id : req.user.id,
			photo_s : req.user.photos[0].value,
			photo_m : req.user.photos[1].value,
			photo_l : req.user.photos[2].value
		}
	);
});

//Generate an unused room ID
app.post('/room', function(req, res) {
	var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	var newRoomID = "";

	while(newRoomID.length != ROOM_ID_LENGTH && rooms[newRoomID] === undefined) {
		for(var i = 0; i < ROOM_ID_LENGTH; i++)
			newRoomID += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
	}

	rooms[newRoomID] = 0;

	res.json({roomId : newRoomID});
});

//Generate a droplet with CSGO server snapshot
app.post('/server/create',
	function(req, res) {
		console.log(config.dropletConfig);

		digitalOcean.dropletsCreate(config.dropletConfig, dropletCreatedCallback(req.body.map, 0));

		res.json({created : true});
	}
);

//Initiate a test remote connection with CSGO server.
app.post('/server/rcon',
	function(req, res) {
		console.log("Initiating test rcon connection.");
		selectedMap = req.body.map;
		var conn = new rcon({
			address: req.body.address,
			password: config.rconPassword,
			initCvars: false
		});
		console.log("Connecting to server : " + req.body.address);
		console.log(conn.host + " " + conn.password + " " + conn.port);
		conn.connect(function() {
			conn.runCommand('changelevel ' + selectedMap, function(err, res) {
				console.log("Changed map to : " + selectedMap);
			});
		});
	}
);

app.post('/server/destroy',
	function(req, res) {
		digitalOcean.dropletsDelete(req.data.id, dropletDestroyedCallback);

		res.json({destroyed : true});
	}
);

//Make the authentication call to steam.
app.get('/auth/steam',
	passport.authenticate('steam'),
	function(req, res) {
		//Doesn't matter won't get called.
});

//Callback for when user signs in on the steamcommunity site.
app.get('/auth/return',
	passport.authenticate('steam'),
 	function(req, res) {
		res.redirect('/login');
	}
);

//Logout from steam account.
app.get('/auth/logout',
	ensureAuthenticated,
	function(req, res) {
		req.logout();
		res.redirect('/');
	}
);

//Socket.io specific code dealing with chat namespace
chat.on('connection', function(socket) {
	
	//Upon joining room, if max users for match already found should redirect to another page
	socket.on('joinRoom', function(data) {
		if(rooms[data.url] === undefined) {
			socket.emit('errorCode', {'statusCode' : 1});
		} else {
			if(rooms[data.url] < MAX_CLIENT_CONN) 
			{
				rooms[data.url] += 1;
				console.log("Joining Room : " + data.url);
				socket.join(data.url);

				if(rooms[data.url] == MAX_CLIENT_CONN) {
					console.log("Initializing captain selection and pick/ban phase");
					//Start timer for choice selection here.
					chat.to(data.url).emit('timer', { time : SELECTION_TIME_LIMIT });

					//Pick a random captain that will ban maps.
					var captain = clientCaptainSelect(users[data.url]);

					//Update the client list before selecting the captain.
					chat.to(data.url).emit('updateClients', { clients : users[data.url] });

					chat.to(data.url).emit('captainSelect', { 'client' : captain });

					//Create a new game instance
					games[data.url] = new Game(data.url, users[data.url]);

				} else {
					//Send update to all players that a new user has joined the room
					chat.to(data.url).emit('updateClients', { clients : users[data.url] });
				}
			} else { 
				console.log("Number of maximum clients reached.");
				socket.emit('errorCode', {'statusCode' : 0});
			}
		}
	});

	socket.on('mapBan', function(data) {
		console.log("Banning map : " + data.map);
		games[data.url].removeMap(data.map);
		chat.to(data.url).emit('mapBan', { map : data.map });
	});

	socket.on('regionSelect', function(data) {
		console.log("Selecting region : " + data.region);
		games[data.url].setRegion(data.region);
		chat.to(data.url).emit('regionSelect', { region : data.region});
	})

	//Send message to everyone within the same room as the user.
	socket.on('message', function(data) {
		chat.to(socket.rooms[1]).emit('response', data);
	});
});

server.listen(8080, function() {
	console.log("Listening on port 8080.");
});

//Middleware function that checks for authenticated users before proceeding.
function ensureAuthenticated(req, res, next) {
	if(req.isAuthenticated()) { return next(); }
	res.redirect('/');
};

//Helper class defining a client along with steam information about that client.
var Client = function(displayName, id, photo_small, photo_med, photo_large) {
	this.displayName = displayName;
	this.id = id;
	this.photo_small = photo_small;
	this.photo_med = photo_med;
	this.photo_large = photo_large;
};

Client.prototype.joinRoom = function(roomId) {
	this.roomId = roomId;
};

Client.prototype.getRoom = function() { 
	return this.roomId;
};

Client.prototype.joinTeam = function(team) {
	this.team = team;
}

Client.prototype.setSocket = function(socket) {
	this.socket = socket;
};

Client.prototype.getSocket = function() {
	return this.socket;
};

/*
	Representation of ongoing game, players are taken from the current room
	once selection of servers and maps is finished. Droplet with CSGO
	server is created and players are given a link to connect to it,
	player IDs are verified to make sure they are the same players.
*/
var Game = function(id, players) {
	this.players = players;
	this.id = id;
	this.maps = ["de_dust2", "de_mirage", "de_cache", "de_cbble", "de_inferno", "de_overpass", "de_train"];
	this.server = null;
};

Game.prototype.setRegion = function(server) {
	this.server = server;
}

Game.prototype.removeMap = function(banned_map) {
	if(this.maps.length > 1) {
		this.maps.splice(this.maps.indexOf(banned_map), 1);
	}

	//Selected element must be the last element left in the array after ban phase.
	if(this.maps.length == 1 && this.server !== null) {
		this.map = this.maps[0];
	}

	this.checkStartConditions();
}

Game.prototype.checkStartConditions = function() {
	if(this.maps.length == 1) {
		console.log("GAME STARTING ON : " + this.map + " IN SERVER : " + this.server);
		chat.to(this.id).emit('serverStartup', { region : this.server, map : this.map});
		digitalOcean.dropletsCreate(config.dropletConfig, dropletCreatedCallback(this.map, this.id));
	}
}

Game.prototype.setIp = function(server_ip) {
	this.ip = server_ip;
}

//Helper function that finds a specific client within the specified room.
findClientByDisplayName = function(roomId, displayName) {
	for(client in users[roomId]) {
		if(client.displayName == displayName) {
			return client;
		}
	}
	return null;
};

//Callback function for when a droplet has been created.
dropletCreatedCallback = function(selectedMap, roomId) {
	return function(err, resp, body) {
		if(err != null) {
			console.log("An error has appeared.");
			console.log(err);
		} else {
			console.log("Server created, remote connection initiated to set map to : " + selectedMap);

			//Set interval to status check if server is up, once server is up try and RCON in to set the map.
			var statusCheck = setInterval(function() {
				console.log("Initiating status check.");

				digitalOcean.dropletsGetById(body.droplet.id, initiateRemoteConnection(selectedMap, statusCheck, roomId));
				
			}, config.rconRetry);
		}
	};
};

//Callback function to setup the remote server according to settings selected in the room.
initiateRemoteConnection = function(selectedMap, statusCheck, roomId) {
	return function(err, resp, body) {
		if(err != null) {
			console.log(err);

			return body.droplet.status;
		} else {

			/*
			    Replacing RCON approach to changing starting map to SSH'ing into server for original setup,
			    then being able to RCON the server for further instructions.
			*/
			if(body.droplet.status == "active") {

				var sshCommand = config.updateSSHCommand(body.droplet.networks.v4[0].ip_address, selectedMap);
				setTimeout(function() {
					ssh('root@'+body.droplet.networks.v4[0].ip_address, {
						command: sshCommand,
						privateKey: config.sshKey,
						readyTimeout: 99999
					}, function(err, stdout) {
						if(err) {
							console.log(err);
						} else {
							console.log(stdout);
						}
					});
				}, config.sshTimeout);

				clearInterval(statusCheck);

				//Send a READY signal to the requested room
				chat.to(roomId).emit("serverReady", { url : "steam://connect/"+body.droplet.networks.v4[0].ip_address+":27015/"+config.serverPassword });
			}
			return body.droplet.status;
		}
	};
};

//Callback function for when a droplet has been destroyed.
dropletDestroyedCallback = function(err, resp, body) {
	if(err != null) {
		console.log("An error has appeared.");
		console.log(err);
	} else {
		console.log(body);
	}
}

//Returns a randomly chosen player to lead the room.
clientCaptainSelect = function(pool) {
	return pool[0];
}
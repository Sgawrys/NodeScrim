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

//Custom modules
var client = require('./libs/client');
var game = require('./libs/game');

var MAX_CLIENT_CONN = 2;
var ROOM_ID_LENGTH = 5;
var SELECTION_TIME_LIMIT = 20;

//Constructor for making Digital Ocean requests.
var digitalOcean = new oceanWrapper(config.digitalOceanAPIKey, config.digitalOceanPerPage);

//Associative array containing a room ID and room count of clients connected.
var rooms = [];

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
	var currentEnv = ensureEnvironment();
	res.render('index', {
		displayName : null,
		id : null,
		photo_s : null,
		photo_m : null,
		photo_l : null,
		env: currentEnv
	});
});

app.get('/room/:roomId',
	ensureAuthenticated,
	function(req, res) {
		console.log("Room ID is : " + req.params['roomId']);

		var player = client.createClient(req.user.displayName,
			req.user.id,
			req.user.photos[0].value,
			req.user.photos[1].value,
			req.user.photos[2].value,
			req.params['roomId']);

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
		var currentEnv = ensureEnvironment();
		res.render('index', { 
			displayName : req.user.displayName,
			id : req.user.id,
			photo_s : req.user.photos[0].value,
			photo_m : req.user.photos[1].value,
			photo_l : req.user.photos[2].value,
			env: currentEnv
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
					var captain = game.selectCaptain(client.getRoom(data.url));

					//Update the client list before selecting the captain.
					chat.to(data.url).emit('updateClients', { clients : client.getRoom(data.url) });

					chat.to(data.url).emit('captainSelect', { 'client' : captain });

					//Create a new game instance
					game.createGame(data.url, client.getRoom(data.url), digitalOcean, chat);

				} else {
					//Send update to all players that a new user has joined the room
					chat.to(data.url).emit('updateClients', { clients : client.getRoom(data.url) });
				}
			} else { 
				console.log("Number of maximum clients reached.");
				socket.emit('errorCode', {'statusCode' : 0});
			}
		}
	});

	socket.on('mapBan', function(data) {
		console.log(socket);
		console.log("Banning map : " + data.map);
		game.findGame(data.url).removeMap(data.map);
		chat.to(data.url).emit('mapBan', { map : data.map });
	});

	socket.on('regionSelect', function(data) {
		console.log("Selecting region : " + data.region);
		game.findGame(data.url).setRegion(data.region);
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

//Whether or not application is currently running in dev or prod.
function ensureEnvironment() {
	if(process.env.NODE_ENV == 'prod') {
		return 0;
	}
	return 1;
}

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
					console.log(sshCommand);
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
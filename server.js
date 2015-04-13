var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var config = require('./config');
var session = require('express-session');
var passport = require('passport'),
	SteamStrategy = require('passport-steam').Strategy;

var MAX_CLIENT_CONN = 2;
var ROOM_ID_LENGTH = 5;
var SELECTION_TIME_LIMIT = 20;

//Associative array containing a room ID and room count of clients connected.
var rooms = []
//Associative array containing a room ID mapped to an array of client objects.
var users = []

//Namespace for multi-room chat
var chat = io.of('/chat');

//Use Jade templating engine, Passport, and Express Sessions
app.set('view engine', 'ejs')
app.use(express.static(__dirname+"/assets/"));
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
				}

				//Send update to all players that a new user has joined the room
				chat.to(data.url).emit('updateClients', { clients : users[data.url] });
			} else { 
				console.log("Number of maximum clients reached.");
				socket.emit('errorCode', {'statusCode' : 0});
			}
		}
	});

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
}

//Helper class defining a client along with steam information about that client.
var Client = function(displayName, id, photo_small, photo_med, photo_large) {
	this.displayName = displayName;
	this.id = id;
	this.photo_small = photo_small;
	this.photo_med = photo_med;
	this.photo_large = photo_large;
}

Client.prototype.joinRoom = function(roomId) {
	this.roomId = roomId;
}

Client.prototype.getRoom = function() { 
	return this.roomId;
}

Client.prototype.setSocket = function(socket) {
	this.socket = socket;
}

Client.prototype.getSocket = function() {
	return this.socket;
}
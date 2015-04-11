var express = require('express');
var app = express();
var server = require('http').Server(app);

var io = require('socket.io')(server);

app.use(express.static(__dirname+"/assets/"));

var chat = io.of('/chat');

//Associative array containing a room ID and room count of clients connected.
var rooms = []


var MAX_CLIENT_CONN = 2;
var ROOM_ID_LENGTH = 5;

app.get('/', function(req, res) {
	res.sendFile(__dirname + '/public/index.html');
});

app.get('/room/:roomId', function(req, res) {
	console.log("Room ID is : " + req.params['roomId']);

	res.sendFile(__dirname + '/public/room.html');
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
})

chat.on('connection', function(socket) {
	socket.on('joinRoom', function(data) {
		if(rooms[data.url] === undefined) {
			socket.emit('errorCode', {'statusCode' : 1});
		} else {
			if(rooms[data.url] < MAX_CLIENT_CONN) 
			{
				rooms[data.url] += 1;
				console.log("Joining Room : " + data.url);
				socket.join(data.url);
			} else { 
				console.log("Number of maximum clients reached.");
				socket.emit('errorCode', {'statusCode' : 0});
			}
		}
	});

	socket.on('message', function(data) {
		chat.to(socket.rooms[1]).emit('response', data);
	});
});

server.listen(8080, function() {
	console.log("Listening on port 8080.");
})
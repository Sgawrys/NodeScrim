var express = require('express');
var app = express();
var server = require('http').Server(app);

var io = require('socket.io')(server);

app.use(express.static(__dirname+"/assets/"));

app.get('/', function(req, res) {
	res.sendFile(__dirname + '/public/index.html');
});


var chat = io
	.of('/chat')
	.on('connection', function(socket) {
		socket.on('message', function(data) {
			//Fan out message to everyone else in the room
			console.log(data.name + " says: " + data.content);
			chat.emit('message', data);
		});
	});

server.listen(8080, function() {
	console.log("Listening on port 8080.");
})
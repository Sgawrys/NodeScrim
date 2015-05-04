/*Client Manager Implementation*/


//Associative array containing a room ID mapped to an array of client objects.
var users = [];

var client = {};

var Client = function(displayName, id, photo_small, photo_med, photo_large) {
	this.displayName = displayName;
	this.id = id;
	this.photo_small = photo_small;
	this.photo_med = photo_med;
	this.photo_large = photo_large;
	this.captain = 0;
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

Client.prototype.setCaptain = function(captain) {
	this.captain = captain;
}

Client.prototype.isCaptain = function() {
	return this.captain;
}

// Creates the client object and places it within a room and returns it. Creates a room if one doesn't exist.
client.createClient = function(displayName, id, photo_small, photo_med, photo_large, roomId) {
	var player = new Client(displayName, id, photo_small, photo_med, photo_large);
	player.joinRoom(roomId);

	if(users[roomId] === undefined) {
		users[roomId] = [];
	}

	users[roomId].push(player);

	return player;
}

// Finds the specified client by display name within the given room
client.findClient = function(displayName, roomId) {
	for(player in users[roomId]) {
		if(player.displayName == displayName) {
			return player;
		}
	}
	return null;
}

// Return a room with that contains all the users
client.getRoom = function(roomId) {
	return users[roomId];
}

module.exports = client;
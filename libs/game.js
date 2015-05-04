/* 
	Game object representation pulled out from server.js 

	Representation of ongoing game, players are taken from the current room
	once selection of servers and maps is finished. Droplet with CSGO
	server is created and players are given a link to connect to it,
	player IDs are verified to make sure they are the same players.
*/
var config = require("../config");

var game = {};

//Ongoing games array
var ongoing = [];

var Game = function(id, players, droplets, chat) {
	this.players = players;
	this.id = id;
	this.maps = ["de_dust2", "de_mirage", "de_cache", "de_cbble", "de_inferno", "de_overpass", "de_train"];
	this.started = false;
	this.server = null;
	this.digitalOcean = droplets;
	this.chat = chat;
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
	if(this.maps.length == 1 && this.started == false) {
		console.log("GAME STARTING ON : " + this.map + " IN SERVER : " + this.server);
		this.chat.to(this.id).emit('serverStartup', { region : this.server, map : this.map});
		this.digitalOcean.dropletsCreate(config.dropletConfig, dropletCreatedCallback(this.map, this.id));
		this.started = true;
	}
}

Game.prototype.setIp = function(server_ip) {
	this.ip = server_ip;
}

game.createGame = function(id, players, droplet, chat) {
	var newGame = new Game(id, players, droplet, chat);

	ongoing[id] = newGame;

	return newGame;
}

game.findGame = function(id) {
	return ongoing[id];
}

/* Selects the first user in any given room to be the captain */
game.selectCaptain = function(pool) {
	var user = pool[0];
	user.setCaptain(1);
	return user;
}

module.exports = game;
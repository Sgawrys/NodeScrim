# NodeScrim

A project that allows for multi-user rooms with chat, authentication via Steam API, and server setup to host a scrim between
two opposing teams in Counter-Strike: Global Offensive. This is still a work in progress and large portions of the code can
and will be changed. I'm using this as a learning experience for the NodeJS environment.

The goal is to allow for captain selection of both respective teams, pick/ban phase for maps and available servers, followed by
automated server setup with selected config files.

## Contributing
---------------------

Clone the project:
```bash
git clone https://github.com/Sgawrys/NodeScrim.git
````

Use [npm](https://www.npmjs.com/) to install necessary node modules.

Pick up an existing issue in the issue tracker, or submit an issue. After making changes, submit a pull request
and I will review it when I have some time. This is just something I'm doing for fun and to better learn NodeJS.

## Running
----------------------

Create a `config.js` file in the root of the project with contents similar to:

```javascript
var config = {}

/*Steam and Express configuration*/
config.steamAPIKey = '';
config.sessionSecret = '';

/*RCON Information*/
config.rconPassword = '';

/*Digital Ocean Configuration*/
config.digitalOceanAPIKey = '';
config.digitalOceanPerPage = RESULTS_PER_PAGE;
config.snapshotID = 0;

module.exports = config;
```

Where the steamAPIKey and sessionSecret are provided by yourself. Afterwards, start the project up and
see it run!

```
npm start
```

## Credits
------------------------------

*	[NodeJS](https://nodejs.org/)
*	[Socket.io](http://socket.io/)
*	[Express](http://expressjs.com/)
*	[Passport](https://github.com/jaredhanson/passport)
*	[Passport-steam](https://github.com/liamcurry/passport-steam)
*	[EJS Templating](http://www.embeddedjs.com/)
*	[Digital Ocean API](https://developers.digitalocean.com/)
*	[Digital Ocean Wrapper](https://github.com/matt-major/do-wrapper)
*	[Node-Srcds-Rcon](https://github.com/randunel/node-srcds-rcon)

## License
--------------------------------

MIT License

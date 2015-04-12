# NodeScrim
=====================

A project that allows for multi-user rooms with chat, authentication via Steam API, and server setup to host a scrim between
two opposing teams in Counter-Strike: Global Offensive. This is still a work in progress and large portions of the code can
and will be changed. I'm using this as a learning experience for the NodeJS environment.

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

config.steamAPIKey = '';
config.sessionSecret = '';

module.exports = config;
```

Where the steamAPIKey and sessionSecret are provided by yourself. Afterwards, start the project up and
see it run!

```
npm start
```

## Credits
------------------------------

[NodeJS](https://nodejs.org/)
[Socket.io](http://socket.io/)
[Express](http://expressjs.com/)
[Passport](https://github.com/jaredhanson/passport)
[Passport-steam](https://github.com/liamcurry/passport-steam)
[EJS Templating](http://www.embeddedjs.com/)

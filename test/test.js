const Server = require('liqd-server');
const Session = require('../lib/session');

const session = new Session( 'user', { storage: { directory: __dirname + '/sessions/' }} );

/*
session.start( 0, 0, () =>
{
	console.log( session.get('a'), session.get('c') );
	session.set( 'a', 'b' ).set( 'c', 'd' );
	console.log( session.get('a'), session.get('c') );
});

setTimeout( process.exit, 1000 );
*/

const server = new Server();

server.use(( req, res, next ) =>
{
	session.start( { req, res }, next );
});

//server.session( '/', 'user', options )

server.get( '/', async( req, res, next ) =>
{
	await session.set( 'counter', ( await session.get( 'counter', 0 )) + 1 );

	next();
});

server.get( '/', async( req, res, next ) =>
{
	console.log( await session.get( 'counter' ) );

	res.end( 'Done' );
});

server.listen( 8080 );

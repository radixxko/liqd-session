'use strict';

const fs = require('fs');
const Flow = require('liqd-flow');
const Cache = require('liqd-cache');

const baseCharCodes = [ 'A'.charCodeAt(0), 'a'.charCodeAt(0), '0'.charCodeAt(0) ];
const randomID = ( length = 16 ) =>
{
	let value = '';

	for( let i = 0; i < length; ++i )
	{
		let c = Math.floor(Math.random() * 62);

		if( c < 26 ){ value += String.fromCharCode( baseCharCodes[0] + c ); }
		else if( c < 52 ){ value += String.fromCharCode( baseCharCodes[1] + c - 26 ); }
		else{ value += String.fromCharCode( baseCharCodes[1] + c - 52 ); }
	}

	return value;
}

const Session = module.exports = class Session
{
	constructor( name, options )
	{
		this.name = name;
		this.options = options;
		this.sessions = new Cache();
	}

	start( req, res, callback )
	{
		Flow.start( callback, { ['session_'+this.name+'_id']: randomID( 16 ) });
	}

	get( key )
	{
		let id = Flow.get( 'session_'+this.name+'_id' );
		let session = this.sessions.get( id );

		if( !session )
		{
			session = {};

			try
			{
				session = JSON.parse( fs.readFileSync( this.options.directory + id + '.json', 'utf8' ));
			}
			catch(e){}

			this.sessions.set( id, session );
		}

		return session[key];
	}

	set( key, value )
	{
		let id = Flow.get( 'session_'+this.name+'_id' );
		let session = this.sessions.get( id );

		session[key] = value;

		fs.writeFile( this.options.directory + id + '.json', JSON.stringify( session ), () => {});

		return this;
	}
}

const session = new Session( 'user', { directory: __dirname + '/../test/sessions/' } );

session.start( 0, 0, () =>
{
	console.log( session.get('a'), session.get('c') );
	session.set( 'a', 'b' ).set( 'c', 'd' );
	console.log( session.get('a'), session.get('c') );
});

setTimeout( process.exit, 1000 );

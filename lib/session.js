'use strict';

const fs = require('fs');
const Flow = require('liqd-flow');
const Cache = require('liqd-cache');
const Options = require('liqd-options');

const baseCharCodes = [ 'A'.charCodeAt(0), 'a'.charCodeAt(0), '0'.charCodeAt(0) ];
const randomID = ( length = 32 ) =>
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

module.exports = class Session
{
	constructor( name, options = {})
	{
		this._options = Options( options,
		{
			maxAge: { _default: 30 * 24 * 60 * 60 * 1000 },
			storage:
			{
				_required: true,

				directory: { _required: true, _type: 'string', _convert: $ => $.endsWith('/') ? $ : $ + '/' }
			},
			cookie:
			{
				name	: { _type: 'string' },
				domain	: { _type: 'string' },
				httpOnly: { _type: 'boolean',	_default: false },
				maxAge	: { _type: 'number' },
				path	: { _type: 'string',	_default: '/' },
				secure	: { _type: 'boolean',	_default: false },
			}
		});

		this.name = name;
		this.sessions = new Cache();
	}

	_getID( scope )
	{
		if( scope.hasOwnProperty('id') )
		{
			return scope.id;
		}
		else if( scope.hasOwnProperty('request') || scope.hasOwnProperty('req') )
		{
			let req = scope['request'] || scope['req'], cookie;

			if(( cookie = req.headers['cookie'] ) && ( cookie = cookie.split(/;\s*/).find( c => c.startsWith((( this._options.cookie && this._options.cookie.name ) || this.name ) + '=' ))))
			{
				let id = decodeURIComponent( cookie.substr( cookie.indexOf('=') + 1 ));

				this._setID( scope, id );

				return id;
			}
		}

		return undefined;
	}

	_setID( scope, id )
	{
		if( scope.hasOwnProperty('id') )
		{
			scope.id = id;
		}
		else if( scope.hasOwnProperty('response') || scope.hasOwnProperty('res') )
		{
			let res = scope['response'] || scope['res'];

			res.setHeader( 'Set-Cookie', (( this._options.cookie && this._options.cookie.name ) || this.name ) + '=' + encodeURIComponent( id ) +
				( !this._options.cookie
				?
					'; Max-Age=' + this._options.maxAge +
					'; Path=/' +
					'; Expires=' + ( new Date((new Date()).getTime() + this._options.maxAge )).toUTCString()
				:
					( '; Max-Age=' + ( this._options.cookie.maxAge || this._options.maxAge )) +
					( this._options.cookie.domain	? '; Domain=' + this._options.cookie.domain : '' ) +
					( this._options.cookie.path		? '; Path=' + this._options.cookie.path : '' ) +
					( '; Expires=' + ( new Date((new Date()).getTime() + ( this._options.cookie.maxAge || this._options.maxAge ))).toUTCString() ) +
					( this._options.cookie.httpOnly	? '; HttpOnly' : '' ) +
					( this._options.cookie.secure 	? '; Secure' : '' )
				)
			);
		}
	}

	_load( id )
	{
		return new Promise( resolve =>
		{
			let session = {};

			fs.readFile( this._options.storage.directory + id + '.json', 'utf8', ( err, data ) =>
			{
				if( !err )
				{
					try{ session = JSON.parse( data ); }catch(e){}
				}

				resolve( session );
			});
		});
	}

	_save( id, session )
	{
		return new Promise(( resolve, reject ) =>
		{
			fs.writeFile( this._options.storage.directory + id + '.json', JSON.stringify( session ), ( err ) =>
			{
				err ? reject( err ) : resolve();
			});
		});
	}

	start( scope, callback )
	{
		let id = this._getID( scope );

		Flow.start( () =>
		{
			Flow.set( '__liqd-session_'+this.name+'_created', Boolean( id ), false );

			callback();
		},
		{
			['__liqd-session_'+this.name+'_id']: id || randomID(),
			['__liqd-session_'+this.name+'_scope']: scope
		});
	}

	get( key, def = undefined )
	{
		let id = Flow.get( '__liqd-session_'+this.name+'_id' );
		let session = this.sessions.get( id );

		if( !session )
		{
			return new Promise( async( resolve ) =>
			{
				this.sessions.set( id, session = await this._load( id ));

				resolve( session.hasOwnProperty(key) ? session[key] : def );
			});
		}
		else{ return session.hasOwnProperty(key) ? session[key] : def }
	}

	set( key, value )
	{
		let id = Flow.get( '__liqd-session_'+this.name+'_id' );
		let session = this.sessions.get( id );

		if( id )
		{
			if( !Flow.get( '__liqd-session_'+this.name+'_created' ))
			{
				Flow.set( '__liqd-session_'+this.name+'_created', true );
				this._setID( Flow.get( '__liqd-session_'+this.name+'_scope' ), id );
			}

			if( !session )
			{
				return new Promise( async( resolve, reject ) =>
				{
					this.sessions.set( id, session = await this._load( id ));

					session[key] = value;

					this._save( id, session ).then( resolve ).catch( reject )//.catch( e => resolve() );
				});
			}
			else
			{
				session[key] = value;

				return this._save( id, session );
			}
		}
		else{ return undefined; }
	}
}

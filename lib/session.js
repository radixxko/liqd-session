'use strict';

const fs = require('fs');
const Flow = require('liqd-flow');
const Cache = require('liqd-cache');
const Options = require('liqd-options');
const Sessions = new WeakMap();

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

const GetID = ( instance, scope ) =>
{
	if( scope.hasOwnProperty('id') )
	{
		return scope.id;
	}
	else if( scope.hasOwnProperty('request') || scope.hasOwnProperty('req') )
	{
		let req = scope['request'] || scope['req'], cookie;

		if(( cookie = req.headers['cookie'] ) && ( cookie = cookie.split(/;\s*/).find( c => c.startsWith((( instance.options.cookie && instance.options.cookie.name ) || instance.name ) + '=' ))))
		{
			let id = decodeURIComponent( cookie.substr( cookie.indexOf('=') + 1 ));

			SetID( instance, scope, id );

			return id;
		}
	}

	return undefined;
}

const SetID = ( instance, scope, id ) =>
{
	if( scope.hasOwnProperty('id') )
	{
		scope.id = id;
	}
	else if( scope.hasOwnProperty('response') || scope.hasOwnProperty('res') )
	{
		let res = scope['response'] || scope['res'];

		res.setHeader( 'Set-Cookie', (( instance.options.cookie && instance.options.cookie.name ) || instance.name ) + '=' + encodeURIComponent( id ) +
			( !instance.options.cookie
			?
				'; Max-Age=' + instance.options.maxAge +
				'; Path=/' +
				'; Expires=' + ( new Date((new Date()).getTime() + instance.options.maxAge * 1000 )).toUTCString()
			:
				( '; Max-Age=' + ( instance.options.cookie.maxAge || instance.options.maxAge )) +
				( instance.options.cookie.domain	? '; Domain=' + instance.options.cookie.domain : '' ) +
				( instance.options.cookie.path		? '; Path=' + instance.options.cookie.path : '' ) +
				( '; Expires=' + ( new Date((new Date()).getTime() + ( instance.options.cookie.maxAge || instance.options.maxAge ) * 1000 )).toUTCString() ) +
				( instance.options.cookie.httpOnly	? '; HttpOnly' : '' ) +
				( instance.options.cookie.secure 	? '; Secure' : '' )
			)
		);
	}
}

const Load = ( instance, id ) => new Promise( resolve =>
{
	let session = {};

	fs.readFile( instance.options.storage.directory + id + '.json', 'utf8', ( err, data ) =>
	{
		if( !err )
		{
			try{ session = JSON.parse( data ); }catch(e){}
		}

		resolve( session );
	});
});

const Save = ( instance, id, session ) => new Promise(( resolve, reject ) =>
{
	fs.writeFile( instance.options.storage.directory + id + '.json', JSON.stringify( session ), ( err ) =>
	{
		err ? reject( err ) : resolve();
	});
});

const Delete = ( instance, id ) =>
{
	fs.unlink( instance.options.storage.directory + id + '.json', () => {});
};

module.exports = class Session
{
	constructor( name, options = {})
	{
		Sessions.set( this,
		{
			options: Options( options,
			{
				maxAge: { _default: 30 * 24 * 60 * 60 },
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
			}),
			name,
			sessions: new Cache()
		});
	}

	start( scope, callback )
	{
		let instance = Sessions.get( this ), id = GetID( instance, scope );

		Flow.start( () =>
		{
			Flow.set( '__liqd-session_'+instance.name+'_created', Boolean( id ), false );

			callback();
		},
		{
			['__liqd-session_'+instance.name+'_id']: id || randomID(),
			['__liqd-session_'+instance.name+'_scope']: scope
		});
	}

	get( key, def = undefined )
	{
		let instance = Sessions.get( this );
		let id = Flow.get( '__liqd-session_'+instance.name+'_id' );
		let session = instance.sessions.get( id );

		if( !session )
		{
			return new Promise( async( resolve ) =>
			{
				instance.sessions.set( id, session = await Load( instance, id ));

				resolve( session.hasOwnProperty(key) ? session[key] : def );
			});
		}
		else{ return session.hasOwnProperty(key) ? session[key] : def }
	}

	set( key, value )
	{
		let instance = Sessions.get( this );
		let id = Flow.get( '__liqd-session_'+instance.name+'_id' );
		let session = instance.sessions.get( id );

		if( id )
		{
			if( !Flow.get( '__liqd-session_'+instance.name+'_created' ))
			{
				Flow.set( '__liqd-session_'+instance.name+'_created', true );
				SetID( instance, Flow.get( '__liqd-session_'+instance.name+'_scope' ), id );
			}

			if( !session )
			{
				return new Promise( async( resolve, reject ) =>
				{
					instance.sessions.set( id, session = await Load( instance, id ));

					session[key] = value;

					Save( instance, id, session ).then( resolve ).catch( reject )//.catch( e => resolve() );
				});
			}
			else
			{
				session[key] = value;

				return Save( instance, id, session );
			}
		}
		else{ return undefined; }
	}

	destroy()
	{
		let instance = Sessions.get( this );
		let id = Flow.get( '__liqd-session_'+instance.name+'_id' );

		if( id )
		{
			SetID( instance, Flow.get( '__liqd-session_'+instance.name+'_scope' ), '' );

			Delete( instance, id );
			instance.sessions.delete( id );
		}
	}
}

const http = require('http');
const Static = require('node-static');
const WebSocketServer = new require('ws').Server;
const dbClient = require('mariasql');
const Promise = require('bluebird');

var c;
Promise.promisifyAll(dbClient.prototype);

var prep_login, prep_registration, prep_save_message, prep_get, prep_kick, prep_kicked;

// login->websocket
var sockets = {};

module.exports.start = function() {
    c = new dbClient({
        host: '127.0.0.1',
        user: 'root',
        password: 'root',
        db: 'mydb'
    });
    prep_login = c.prepare('SELECT * FROM User WHERE Username = :username AND Password = :password');
    prep_registration = c.prepare('INSERT INTO User (username, password) VALUES (:username, :password)');
    prep_save_message = c.prepare('INSERT INTO Message (userfrom, text, userto) VALUES (:userfrom, :text, :userto)');
    prep_get = c.prepare('SELECT * FROM Message WHERE UserTo = :username OR ISNULL(UserTo)');
    prep_kick = c.prepare('UPDATE User SET Kicked=TRUE WHERE Username=:username');
    prep_kicked = c.prepare('SELECT * FROM User WHERE Kicked=TRUE AND Username=:username');
    
	return new Promise((resolve, reject) => {
		var server = new WebSocketServer({ port: process.env.PORT }, function(err) {
			if (err)
				reject(err);
			else
				resolve(server);
		});
	})
	.then(function(server) {
		webSocketServer = server;
		webSocketServer.on('connection', f);
	})
	.catch(function(e) {
        console.log(e);
        console.log(e.stack);
		process.exit(e.code);
	});
};

module.exports.stop = function() {
	return new Promise((resolve, reject) => {
		webSocketServer.close(function(err) {
			c.end();
            if (err)
				reject(err);
			else
				resolve();
		})
	});
};

var webSocketServer;
function f(ws) {
    var login = undefined;
    
    console.log("новое соединение");
    
    ws.on('message', function(message) {
        
        try {
        
            console.log('получено сообщение ' + message);
            message = JSON.parse(message);
        
            
            switch (message.command) {
            case "login":
                if (login) 
                    ws.send(JSON.stringify({"command":"login_status", "status":"fail", "reason": "you tried to login twice"}));
                else {
                    c.query(prep_login({ username: message.username, password: message.password }))
                    .on('result', function(res) {
                        res.on('data', function(row) {
                           
                            login = message.username;
                            sockets[message.username] = ws;
                            
                            ws.send(JSON.stringify({"command":"login_status", "status":"success"}));
                            
                        }).on('end', function() {
                            if (!login) 
                                ws.send(JSON.stringify({"command":"login_status", "status":"fail"}));
                        });
                    });
                                
                    
                }
                break;
                        
            case "registration":
                // добавить в базу данных юзера
                c.query(prep_registration({ username: message.username, password: message.password }),
                function(err) {
                    if (err) {
                        ws.send(JSON.stringify({"command":"registration_status", "status":"fail"}));
                    }
                    else {
                        ws.send(JSON.stringify({"command":"registration_status", "status":"success"})); 
                    }             
                });
                        
                break;
            case "message":
                var kicked = false;
                c.query(prep_kicked({ username: login }))
                .on('result', function(res) {
                    res.on('data', function(row) {
                        kicked = true;
                    });
                    res.on('end', function() {
                        if (!login || kicked)
                            ws.send(JSON.stringify({"status" : "fail", "reason" : "you are not allowed to send a message"}));
                        else {
                            message.userfrom = login;
                            if (message.userto && (sockets[message.userto] == undefined)) 
                                ws.send(JSON.stringify({"status" : "fail", reason : "no user with required login"}));
                            else {
                                // текстовое сообщение надо сохранить в базу данных
                                c.query(prep_save_message({ userfrom: message.userfrom, text: message.text, userto: message.userto || null }), function(err) {
                                    if (err)
                                        throw err;
                                    console.log("Message \"" + message.text + "\" saved to DB");
                                });

                                // и разослать всем подключенным сейчас клиентам, либо адресату
                                if (message.userto) {
                                    var userto = message.userto;
                                    delete message.userto;
                                    sockets[userto].send(JSON.stringify(message)); 
                                }
                                else  {
                                    for(var key in sockets)
                                        sockets[key].send(JSON.stringify(message));
                                }
                            }
                        }
                    });
                });
                
                break;
            case "get": 
                var kicked = false;
                c.query(prep_kicked({username: login}))
                .on('result', function(res) {
                    res.on('data', function(row) {
                        kicked = true;
                    });
                    res.on('end', function() {
                        if (!login || kicked)
                            ws.send(JSON.stringify({"status" : "fail", "reason" : "you are not allowed to get messages"}));
                        else {
                            c.query(prep_get({ username: login }), function(err, rows) {
                                if (err)
                                    throw err;
                                delete rows.info;
                                ws.send(JSON.stringify({ command : "get_response", messages: rows }));
                            });
                        }        
                    });
                });
                
                break;
                case "logout":
                    delete sockets[login];
                    console.log("Connection closed with user: " + login);
                    login = undefined;
                    ws.send(JSON.stringify({command: "logout_status", "status": "success"}));
                    break;
                case 'kick':
                    c.query(prep_kick({ username: message.username }), function(err, rows) {
                        if (err)
                            throw err;
                        ws.send(JSON.stringify({command: "kick_status", "status": "success"}))
                    });
                    break;
                default:
                    console.log("Unknown message type!");  
                }
            }
            catch (err) {
                ws.send(JSON.stringify({ "status" : "fail", "error" : err.toString() }))
            }
        }
    );

    ws.on('close', function() {

        delete sockets[login];
        console.log("Connection closed with user: " + login);
        login = undefined;
    });
};

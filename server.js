const http = require('http');
const Static = require('node-static');
const WebSocketServer = new require('ws');
const dbClient = require('mariasql');

var c = new dbClient({
    host: '127.0.0.1',
    user: 'root',
    password: 'root',
    db: 'mydb'
});

var prep_login = c.prepare('SELECT * FROM User WHERE Username = :username AND Password = :password');
var prep_registration = c.prepare('INSERT INTO User (username, password) VALUES (:username, :password)');
var prep_save_message = c.prepare('INSERT INTO Message (userfrom, text, userto) VALUES (:userfrom, :text, :userto)')

// login->websocket
var sockets = {};



// WebSocket-сервер на порту 8081
var webSocketServer = new WebSocketServer.Server({port: 5678});
webSocketServer.on('connection', function(ws) {
    var login = undefined;
    console.log("новое соединение");
    
    ws.on('message', function(message) {
    
        message = JSON.parse(message);
        console.log('получено сообщение ' + message);
        
    
        switch (message.command) {
        case "login":
            // проверить, есть ли такой пользователь 
            // FIXME: почему-то в logins[ws] пусто в обоих случаях... 
            //console.log(logins[ws]);
            //console.log(logins);
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
                                
                c.end();
            }
            break;
                        
        case "registration":
            // добавить в базу данных юзера
            // FIXME: запретить дважды регистрироваться
            c.query(prep_registration({ username: message.username, password: message.password }), function(err, rows) {
                if (err) {
                    ws.send(JSON.stringify({"command":"registration_status", "status":"fail"}));
                    throw err;
                }
                ws.send(JSON.stringify({"command":"registration_status", "status":"success"}));
                                
            });
            c.end();
                        
            break;
        case "message":
            // текстовое сообщение надо сохранить в базу данных
            c.query(prep_save_message({ userfrom: message.userfrom, text: message.text, userto: message.userto || null }), function(err, rows) {
                if (err)
                    throw err;
                console.log("Message \"" + message.text + "\" saved to DB");
            });

            // и разослать всем подключенным сейчас клиентам, либо адресату
            // message {"command" : "message", "text": message, "userto" : userto }
            // TODO: удалить из message поле userto
            message.userfrom=logins[ws];
            if (message.userto) {
                delete message.userto;
                cliens[userto].send(message); 
            }
            else
                // FIXME: не уверена, что цикл корректный.
                console.log('Server wants to send a message to everybody');
                for(var key in sockets) {
                    console.log(key);
                    console.log(sockets[key]);
                    sockets[key].send(message); 
                }
            break;
        default:
            console.log("Unknown message type!");  
        }
    });

    ws.on('close', function() {
        console.log("Connection closed with user: "+logins[ws]);
        delete sockets[logins[ws]];
        delete logins[ws];
    });

});

console.log("Сервер запущен на портах 8080, 8081");

/*
var arr = {};
arr["AAA"] = 2;
arr["BBB"] = 45;
console.log("length: " + arr.length);
for (var key in arr) {
    console.log(key);
    console.log(arr[key]); 
}
*/


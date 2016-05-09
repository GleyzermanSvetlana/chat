const WebSocket = require('ws');
const Promise = require('bluebird');
const chai = require('chai');
const assert = chai.assert;
const should = chai.should();
const dbClient = require('mariasql');
const chaiAsPromised = require('chai-as-promised');
const Server = require('../server.js');
chai.use(chaiAsPromised);

function clearDB() {
    return c.queryAsync('DELETE FROM Message')
    .then(() =>  c.queryAsync('DELETE FROM User'));
}

function WSConnection() {
    'use strict';
    this.socket = {};
}


var c;

Promise.promisifyAll(dbClient.prototype);

before(function() {
    c = new dbClient({
        host: '127.0.0.1',
        user: 'root',
        password: 'root',
        db: 'mydb'
    });
    return Server.start();
});

after(function() {
    c.end(); 
    return Server.stop();
});



WSConnection.prototype.connect = function (url) {
    'use strict';
    var wsc = this;
    return new Promise((resolve, reject) => {
        wsc.socket = new WebSocket(url);
        wsc.socket.onopen = function () {
            resolve();
        };
        wsc.socket.onerror = function(error) {
            reject(error);
        };
    });
};

WSConnection.prototype.send = function(msg) {
    this.socket.send(JSON.stringify(msg));
}


WSConnection.prototype.disconnect = function () {
    'use strict';
    var ws = this.socket;
    return new Promise((resolve, reject) => {
        ws.on('error', reject);
        ws.on('close', resolve);
        ws.close();
    });
};


function Client() {
    this.ws = new WSConnection();
}

Client.prototype.connect = function() {
    return this.ws.connect('ws://localhost:' + process.env.PORT);
};

Client.prototype.disconnect = function() {
    return this.ws.disconnect();
};

Client.prototype.sendRequest = Promise.promisify(function(request, callback) {
    this._receiveMessage(callback);
    this.ws.send(request);
});

Client.prototype.sendRequestNoWait = Promise.promisify(function(request, callback) {
    if (callback) {
        callback(undefined, undefined);
    }
    this.ws.send(request);
});

Client.prototype.login = function(username, password) {
    return this.sendRequest({ "command": "login", "username" : username, "password" : password });
};

Client.prototype.register = function(username, password) {
    return this.sendRequest({ "command": "registration", "username" : username, "password" : password });
};

Client.prototype.sendMessage = function(message, userto) {
    if (userto)
        return this.sendRequestNoWait({ command : "message", text: message, userto : userto });
    else
        return this.sendRequestNoWait({ command : "message", text: message });  
};

Client.prototype._receiveMessage = function(callback) {
    if (callback) {
        var socket = this.ws.socket;
        socket.on('message', function f(response) {
            socket.removeListener('message', f);
            response = JSON.parse(response);
            if ('status' in response && response.status != 'success')
                callback(response, undefined); // error
            else
                callback(undefined, response); // data
        })
    }
};

Client.prototype.getMessages = function() {
    return this.sendRequest({command: "get"});
};

Client.prototype.logout = function() {
    return this.sendRequest({command: "logout"});
};

Client.prototype.kick = function(username) {
    console.log('kick request');
    return this.sendRequest({command: "kick", username: username });
};

Client.prototype.receiveMessage = Promise.promisify(Client.prototype._receiveMessage);

describe('Server', function() {
    var username = '__user' + Date.now();
    it('can register and login a client', function() {
        var client = new Client();
        return client.connect()
        .then(() => client.register(username, 'password'))
        .should.become({ status: 'success', command: 'registration_status' })
        .then(() => client.login(username, 'password'))
        .should.become({ status: 'success', command: 'login_status' });
    });
  
    it('can send a message to its author', function() {
        var client = new Client();
        return client.connect()
        .then(() => client.login(username, 'password'))
        .should.become({ status: 'success', command: 'login_status' })
        .then(() => client.sendMessage('message to self', username))
        .then(() => client.receiveMessage())
        .should.become({ command: 'message', userfrom: username, text: 'message to self' })
        .then(() => client.disconnect());
    });
    
    it('can send a message to another client', function() {
        var u1 = username;
        var u2 = username + '$';
        var c1 = new Client();
        var c2 = new Client();
        return c1.connect().then(() => c1.login(u1, 'password'))
        .then(() => c2.connect()).then(() => c2.register(u2, 'password')).then(() => c2.login(u2, 'password'))
        .then(() => c1.sendMessage('message to $', u2))
        .then(() => c2.receiveMessage())
        .should.become({ command: 'message', userfrom: u1, text: 'message to $' })
        .then(() => c1.disconnect())
        .then(() => c2.disconnect());
    });
    
    it('can send a message to everybody', function() {
        var sender = new Client();
        var receiver1 = new Client();
        var receiver2 = new Client();
        
        return clearDB()
        .then(() => sender.connect())
        .then(() => receiver1.connect())
        .then(() => receiver2.connect())
        
        .then(() => sender.register('sender', 'password'))
        .should.become({ status: 'success', command: 'registration_status' })
        .then(() => sender.login('sender', 'password'))
        
        .then(() => receiver1.register('receiver1', 'password1'))
        .should.become({ status: 'success', command: 'registration_status' })
        .then(() => receiver1.login('receiver1', 'password1'))
        
        .then(() => receiver2.register('receiver2', 'password2'))
        .should.become({ status: 'success', command: 'registration_status' })
        .then(() => receiver2.login('receiver2', 'password2'))
        
        .then(() => sender.sendMessage('message to everybody'))
        .then(() => sender.receiveMessage())
        .should.become({command: 'message', userfrom: 'sender', text: 'message to everybody'})
        .then(() => receiver1.receiveMessage())
        .should.become({command: 'message', userfrom: 'sender', text: 'message to everybody'})
        .then(() => receiver2.receiveMessage())
        .should.become({command: 'message', userfrom: 'sender', text: 'message to everybody'});
        
    });
   
    
    it('doesn\'t allow to send a message until logging in', function() {
        var client = new Client();
        return client.connect()
        .then(() => client.sendMessage('message'))
        .then(() => client.receiveMessage().should.be.rejected);
    });
    
    it('doesn\'t allow to get old messages until logging in', function() {
        var client = new Client();
        return client.connect()
        .then(() => client.getMessages().should.be.rejected);
    });
    
    it('can forbid to send a message to a nonexisting user', function () {
        var client = new Client();
        return clearDB()
        .then(() => client.connect())
        .then(() => client.register(username, "password"))
        .then(() => client.login(username, "password"))
        .then(() => client.sendMessage("message", "nonexistinguser"))
        .then(() => client.receiveMessage().should.be.rejected)
        .then(() => client.disconnect());
    });
    
    it('can forbid to get messages of the kicked user', function () {
        var admin = new Client();
        var kicked = new Client();
        return clearDB()
        .then(() => admin.connect())
        .then(() => admin.register("admin", "123"))
        .then(() => admin.login("admin", "123"))
        .then(() => kicked.connect())
        .then(() => kicked.register("kicked", "1234"))
        .then(() => kicked.login("kicked", "1234"))
        .then(() => admin.kick("kicked"))
        .should.become({command: "kick_status", "status": "success"})
        .then(() => kicked.getMessages().should.be.rejected);
    });
    
    it('can forbid to get messages of the unlogined user', function() {
        var client = new Client();
        return client.connect()
        .then(() => client.getMessages().should.be.rejected);
    }); 
    
    it('can send a kick to somebody and forbid kicked user to send and get messages', function() {
        var admin = new Client();
        var kicked = new Client();
        return clearDB()
        .then(() => admin.connect())
        .then(() => admin.register("admin", "123"))
        .then(() => admin.login("admin", "123"))
        .then(() => kicked.connect())
        .then(() => kicked.register("kicked", "1234"))
        .then(() => kicked.login("kicked", "1234"))
        .then(() => admin.kick("kicked"))
        .should.become({command: "kick_status", "status": "success"})
        .then(() => kicked.sendMessage('message'))
        .then(() => kicked.receiveMessage().should.be.rejected)
        .then(() => kicked.getMessages().should.be.rejected);
    });
    
    it('can get old messages', function () {
        var client = new Client();
        return client.connect()
        .then(() => client.register(username, "password"))
        .then(() => client.login(username, "password"))
        .then(() => client.getMessages())
        .then(() => client.disconnect());
        // FIXME: не дописано. надо желательно залезть в базу данных и посмотреть, что там именно эти сообщения и есть
    });
     
    it('can prevent registration with the same logins', function() {
        var client = new Client();
        return clearDB()
        .then(() => client.connect())
        .then(() => client.register("user1", "password1"))
        .should.become({"command":"registration_status", "status":"success"})
        .then(() => client.register("user1", "password2").should.be.rejected);
    });
    
    it('can login and logout and then login again', function() {
         var client = new Client();
         return client.connect()
         .then(() => client.register(username, "password"))
         .then(() => client.login(username, "password"))
         .should.become({command: "login_status", "status": "success"})
         .then(() => client.logout())
         .should.become({command: "logout_status", "status": "success"})
         .then(() => client.login(username, "password"))
         .should.become({command: "login_status", "status": "success"});
    });
    
    it('can prevent trying to login twice', function () {
        var client = new Client();
        return client.connect()
        .then(() => client.login(username, "password"))
        .should.become({command: "login_status", "status": "success"})
        .then(() => client.login(username, "password").should.be.rejected);
    });
     

    it('can send back a message with error if trying to login with wrong password/login', function() {
        var client = new Client();
        return client.connect()
        .then(() => client.login(username, "not_a_password").should.be.rejected);
    }); 
    
});
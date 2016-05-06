var WebSocket = require('ws');
var ws = new WebSocket('ws://localhost:5678');

ws.on('open', function open() {
        //registration("user", "123");
        mylogin = "user";
        
//        login(mylogin, "123");
        
//        login(mylogin, "123");

        ws.on('message', function(message) {
            check_status(message);
            ws.on('message', function(message)) {
                check_status(message);
                
                send(123);
            }
            send("123");
        });
        login(mylogin, "123");
        
        //login("user", "123");login("user", "123");
        //send_message(mylogin, "hello");
        
});

/*
ws.on('message', function(message) {
  
        message = JSON.parse(message);
        switch (message.command) {
        case "registration_status":
                console.log("Registration status: " + message.status);
                break;
        case "login_status":
                console.log("Login status: " + message.status);
                break;
        case "message": 
                console.log("Got a message: " + message.text + "from user" + message.userfrom);          
                break;
        default:
                console.log("Unkown type of message!");
        }
  
});
*/

function login(username, password) {
        var msg = JSON.stringify({ "command": "login", "username" : username, "password" : password });
        ws.send(msg);
}

function registration(username, password) {
        var msg = JSON.stringify({ "command": "registration", "username" : username, "password" : password });
        ws.send(msg);
}

function send_message(login, message, userto) {
        var msg;
        if (userto)
                msg = {"command" : "message", "text": message, "userto" : userto, "userfrom" : login };
        else
                msg = {"command" : "message", "text": message, "userfrom" :login };
        msg = JSON.stringify(msg);
        ws.send(msg);
        
}




var SerialPort = require("serialport");
var express = require('express');
var app = express();
var ip = require("ip");

//--------------http-----------------------//
var http = require('http');

//--------------https-----------------------//
var https = require('https');


//--------------File_System---------------//

var fs = require('fs');
const junk = require('junk');

var httpsOptions = {
   key: fs.readFileSync('my-key.pem'),
   cert: fs.readFileSync('my-cert.pem')
 };



var checkMedia = function(){

  fs.readdir("./public/media", success);

  function success(err,Flist){
    console.log(Flist);
    
    if(err){
      io.emit(err);
      return
    }

    Flist = Flist.filter(junk.not);
    io.emit("returnMD",Flist);
  }


}


//--------------https_End-----------------------//

var io = null;


var useHttps = true;

if(useHttps == false){

  httpServer = http.createServer(app);

  httpServer.listen(3000, function(){
      console.log("");
      console.log("");
      console.log("---------------|  Roomba Testing  |-----------------");
      console.log("");
      console.log("Service server open on http://"+ ip.address() + ":" + 3000);
  });


  io = require('socket.io')(http);

}
else{

  var httpsServer = https.createServer(httpsOptions,app);

  httpsServer.listen(3000,function(){

    console.log("");
    console.log("---------------| Roomba |-----------------");
    console.log("");
    console.log("Service server open on https://"+ ip.address() + ":" + 3000);

  });

  io = require('socket.io')(httpsServer);
}

app.use(function (req, res, next) {

    res.header('Access-Control-Allow-Origin', "https://teleroomba.itp.io:8000");
    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);

    // Pass to next layer of middleware
    next();
});


app.use(express.static('public'));

app.get('/info', function(req, res){
  res.sendfile('public/info.html');
});

app.get('/localQR', function(req, res){
  res.sendfile('public/localQR.html');
});


var cmd = {
  cmd : 0,
  buffer1 : 0,
  buffer2 : 0,
};

var startUpSequence = {
    cmdSequence:[
                 {//Enter safe mode
                  cmd : 4,
                  buffer1 : 0,
                  buffer2 : 0
                 },
                 {//Start beep
                  cmd : 2,
                  buffer1 : 1,
                  buffer2 : 2
                 },
                 {//Stop beep
                  cmd : 2,
                  buffer1 : 2,
                  buffer2 : 0
                 },
                 {//Reset camera angle
                  cmd : 5,
                  buffer1 : 0,
                  buffer2 : 0,
                  buffer3 : 90,
                  buffer4 : 128,
                 },
                 {//Standby
                  cmd : 0,
                  buffer1 : 0,
                  buffer2 : 0,
                 },
                ],

    durationSequence:[100,800,100,100,100],
    sequenceDriver: function(step){
            cmd = startUpSequence.cmdSequence[step];
            console.log('\x1b[33m',"[startup sequence" + step + "]>> ",'\x1b[0m',cmd);

            setTimeout(function(){
              if( step < startUpSequence.cmdSequence.length - 1 ){
                startUpSequence.sequenceDriver( step + 1 );
              }else if(step == startUpSequence.cmdSequence.length - 1){
                startupLog();
              }

            },startUpSequence.durationSequence[step]);
    }
}



//-------SerialPort----------//

//Unix MacOS
var portNameChoice = ["/dev/cu.usbmodem1411", "/dev/cu.usbmodem1421", "COM3", "COM5", "COM6"];
portName = null;
var panda_arduino_Port = null;

SerialPort.list(function (err, ports) {
  ports.forEach(function(port) {
    //console.log(port);
     //console.log(port.comName);
    // console.log(port.pnpId);
    // console.log(port.manufacturer);

    for(i=0; i < portNameChoice.length ;i++){

      if(portNameChoice[i] == port.comName){
        portName = port.comName;
        // console.log("ok " + i);
      }

    }

  });

  if(portName != null){

    panda_arduino_Port = new SerialPort(portName, {
       baudRate: 38400,
       // look for return and newline at the end of each data packet:
       parser: SerialPort.parsers.readline("\n")
     });
    //console.log(panda_arduino_Port);

    panda_arduino_Port.on('open', function() {
      console.log("Serial opened on " + portName);


          //Fire Startup_Sequence//
          setTimeout(function(){
            panda_arduino_Port.write("ready");
            startUpSequence.sequenceDriver(0);
          },1200);

    });

    panda_arduino_Port.on('data', function(data) {
      //data feed check
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(data);
      //console.log(">> " + data);
      //console.log(cmd.cmd + "," + cmd.buffer1 + "," + cmd.buffer2 + "\n");

      var serialSend = null;

      if( cmd.cmd < 5 ){
        serialSend = (cmd.cmd + "," + cmd.buffer1 + "," + cmd.buffer2);
      }else{
        serialSend = (cmd.cmd + "," + cmd.buffer1 + "," + cmd.buffer2 + ","+ cmd.buffer3 + ","+ cmd.buffer4);
        cmd.cmd -= 5;
        cmd.buffer3 = 0;
        cmd.buffer4 = 0;
      }
      //console.log(serialSend);


      panda_arduino_Port.write(serialSend);

    });

    // open errors will be emitted as an error event
    panda_arduino_Port.on('error', function(err) {
      console.log('Error: ', err.message);
    });

    }

    else{
      console.log("No avaliable serial port");
      startupLog(1);
    }
});

//---------Socket.io------------//

//var serialReady = true;

io.on('connection', function (socket) {
  console.log( " Teleroomba UI opened via socket " + socket.id);

  patchCMD = function(raw){
      if(cmd.cmd >= 5){
        raw += 5;
        return raw
      }
      else{
        return raw
      }
  }

  socket.on("DR",function(drive){//Drive
    cmd.cmd = patchCMD(1);
    cmd.buffer1 = drive.lV;
    cmd.buffer2 = drive.rV;

  });

  socket.on("BP",function(beep){//Beep
    cmd.cmd = patchCMD(2);
    cmd.buffer1 = beep.act;
    cmd.buffer2 = beep.tp;
    console.log(cmd);
  });

  socket.on("DK",function(){//Dock
    cmd.cmd = patchCMD(3);
    cmd.buffer1 = 0;
    cmd.buffer2 = 0;
    console.log("--CMD: DOCK--");
  });

  socket.on("SM",function(){//Safe_Mode
    cmd.cmd = patchCMD(4);
    cmd.buffer1 = 0;
    cmd.buffer2 = 0;
    //console.log("--CMD: SAFE MODE--");
    //console.log(cmd);
  });

  socket.on("FC",function(camera){//Front_Camera
    if(cmd.cmd<5){
      cmd.cmd += 5;
    }
    cmd.buffer3 = camera.r;
    cmd.buffer4 = camera.p;
    //console.log(cmd);
  });

  socket.on("reqIP",function(){
    io.emit("resIP",ipNport + ":3000");
    console.log("\nIP responded");
  });

  socket.on("checkMD",function(){
    checkMedia();
  });
  

});

//----------log_ip-----------------//
var ipNport = "did not get IP yet";

function GetLocalIPAddr(){ 
console.log("\nlocal IP Address: ", '\x1b[32m');
ipNport = ip.address();
console.log(ipNport);
console.log('\x1b[0m' );
}


//----------open_in_os-------------//

var open = require("open");


//----------startup----------------//
function startupLog(err){
  GetLocalIPAddr();
  if(err){

    if(err == 1){
      console.log('\x1b[31m',"[startup error]>> ",'\x1b[0m',"Check Serial");
    }

    return false
  }
  open("https://teleroomba.itp.io:8000/role");
  console.log('\x1b[33m',"[startup done]>> ",'\x1b[0m',"Everthing's fine, teleroomba is ready to connect :)");
}


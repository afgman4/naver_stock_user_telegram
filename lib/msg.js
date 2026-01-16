
var admin = require("firebase-admin");

var serviceAccount = require("../resource/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://pushtest-6ca05.firebaseio.com"
});

var registrationToken = "dKGt32Ib9AM:APA91bGzYytrZ6v55RgCoKZYyv8NogilRa8luVRxONM__BU1o76YUhQFR4uJnHyfEa3OUTXC7784xi2c6LZWN2EpcsqEK8hcVg8GLrdLO0uuzbDBhmZaCpt_ZHRu5w1e0t0Twhg2ohO4";

function sendMsg(title, msg){
  var payload = {
    notification: {
      title: title,
      body: msg
    }
  };
  
  admin.messaging().sendToDevice(registrationToken, payload)
    .then(function(response) {
      console.log("Successfully sent message:", response);
    })
    .catch(function(error) {
      console.log("Error sending message:", error);
    });
}

module.exports.sendMsg = sendMsg;
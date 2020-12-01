const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

/*
 * Trigger: Automatic every 1 minutes
 * Set rides created more than 5 minutes ago as 'expired'
 */
exports.ridesAutoExpire = functions.pubsub.schedule('every 1 minutes').onRun((context) => {
    const now = Date.now()
    const asyncJobs = []

    return admin
        .firestore()
        .collection("rides")
        .where('autoExpiredTimestamp', '==', null)
        .where('cancelledByPassengerTimestamp', '==', null)
        .where('driverId', '==', null)
        .get()
        .then(ridesSnapshot => {
            ridesSnapshot.forEach(rideSnapshot => {
                const ride = rideSnapshot.data()
                const creationTimestamp = ride.creationTimestamp
                const lifeTimeInMinutes = (now - creationTimestamp.toDate().getTime()) / 60000

                if (lifeTimeInMinutes > 5) {
                    asyncJobs.push(setRideExpired(rideSnapshot.id))
                    console.log('Ride ', rideSnapshot.id, ' is now expired because it has been created ', lifeTimeInMinutes, ' minutes ago.')
                } else {
                    console.log('Ride ', rideSnapshot.id, ' has been created ', lifeTimeInMinutes, ' minutes ago. Let it live a bit longer.')
                }
            });

            return Promise.all(asyncJobs)
        })
    .catch(err => {
        console.log(err);
    });
})

function setRideExpired(rideId) {
    return admin.firestore().collection('rides').doc(rideId).update({
        'autoExpiredTimestamp': admin.firestore.FieldValue.serverTimestamp()
    });
}

/*
 * Trigger: A new ride request has been created by a passenger
 * Send a Cloud Message to all drivers
 */
exports.rideCreated = functions.firestore
  .document('rides/{rideId}')
  .onCreate((snapshot, context) => {
    let ride = snapshot.data()
    return sendFCMToAllDrivers(ride).catch(error => { console.log(error) })
  })

function sendFCMToAllDrivers(ride) {
    return admin
        .firestore()
        .collection("drivers")
        .where("isVerified", "==", true)
        .get()
        .then(driversSnapshot => {
            const asyncJobs = []
            driversSnapshot.forEach(driverSnapshot => {
                const driver = driverSnapshot.data()
                asyncJobs.push(sendFCMToDriver(driver, ride))
            });

            return Promise.all(asyncJobs)
        })
  }

function sendFCMToDriver(driver, ride) {
    const fcmTokens = driver.fcmTokens
    if (fcmTokens === undefined || fcmTokens.length === 0) {
      return
    }

    var title = 'New ride available';
    var body = 'From ' + ride.startPlace + ' to ' + ride.endPlace

     if (driver.language === 'fr') {
      title = 'Nouveau trajet disponible'
      body = 'De ' + ride.startPlace + ' à ' + ride.endPlace
    }

    const message = {
        notification: {title: title, body: body},
        // data: {value1: '850', value2: '2:45'},
        tokens: fcmTokens,
    }

    return admin.messaging().sendMulticast(message)
      .then((response) => {
            console.log(response.successCount + ' messages were sent successfully')
            return
      })
}

/*
 * Trigger: A driver has been created
 * Set the driver as not verified
 */
exports.driverCreated = functions.firestore
   .document('drivers/{driverId}')
   .onCreate((snapshot, context) => {
     let driver = snapshot.data()

   return admin.firestore().collection('drivers').doc(snapshot.id).update({ 'isVerified': false });
})
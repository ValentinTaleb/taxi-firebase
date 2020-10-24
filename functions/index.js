const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Set rides created more than 5 minutes ago as 'expired'
exports.ridesAutoExpire = functions.pubsub.schedule('every 1 minutes').onRun((context) => {
    const now = Date.now()
    const asyncJobs = []

    return admin
        .firestore()
        .collection("rides")
        .where('autoExpiredTimestamp', '==', null)
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

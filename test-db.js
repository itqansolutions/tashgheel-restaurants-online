const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://TashgheelRest:tiIeHRcROCt4WFTz@cluster0.ehhhepk.mongodb.net/?appName=Cluster0';

console.log('--- MongoDB Connection Test (New Cluster) ---');
console.log('Connecting to:', MONGO_URI.split('@')[1]);

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ Success: Connection established!');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Error: Connection failed!');
        console.error('Reason:', err.message);
        process.exit(1);
    });

setTimeout(() => {
    console.error('❌ Error: Connection timed out (10s)');
    process.exit(1);
}, 10000);

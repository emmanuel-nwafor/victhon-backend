const axios = require('axios');
require('dotenv').config();

async function check() {
    try {
        console.log("Logging in...");
        const loginRes = await axios.post('https://victhon-backend-khau.onrender.com/api/v1/admin/login', {
            email: process.env.DEFAULT_ADMIN_EMAIL,
            password: process.env.DEFAULT_ADMIN_PASSWORD
        });
        
        const token = loginRes.data.data.token;
        console.log("Token received.");

        console.log("Fetching users...");
        const usersRes = await axios.get('https://victhon-backend-khau.onrender.com/api/v1/admin/users?page=1&limit=50', {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log("USERS API STATUS:", usersRes.status);
        console.log("USERS PAYLOAD:", JSON.stringify(usersRes.data, null, 2));

        console.log("Fetching professionals...");
        const prosRes = await axios.get('https://victhon-backend-khau.onrender.com/api/v1/admin/professionals?page=1&limit=5', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("PROS API STATUS:", prosRes.status);
        console.log("PROS COUNT:", prosRes.data?.data?.professionals?.length);
        
    } catch (e) {
        console.error("ERROR:");
        if (e.response) {
            console.error(e.response.status, e.response.data);
        } else {
            console.error(e.message);
        }
    }
}

check();

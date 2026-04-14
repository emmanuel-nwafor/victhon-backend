import axios from 'axios';

async function test() {
    try {
        const res = await axios.post('https://victhon-backend-khau.onrender.com/api/v1/admin/login', {
            email: "default@email.com",
            password: "a9c919172b99e8cea77d4cecb22c1d29"
        });
        console.log("Success:", res.data);
    } catch (err: any) {
        console.log("Error status:", err.response?.status);
        console.log("Error data:", err.response?.data);
    }
}
test();

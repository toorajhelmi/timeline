// src/Signup.js
import React, { useState } from 'react';
import axios from 'axios';

const Signup = () => {
    const [citizen, setCitizen] = useState({
        // Assuming your Citizen model has an id, name, email, etc.
        name: '',
        email: '',
        // ... other fields
    });

    const handleChange = (e) => {
        setCitizen({ ...citizen, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post('/api/citizens', citizen);
            console.log(response.data);
            // Handle further actions like redirecting the user to another page or showing a success message
        } catch (error) {
            console.error('There was an error creating the citizen!', error);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <input
                type="text"
                name="name"
                value={citizen.name}
                onChange={handleChange}
                placeholder="Full Name"
            />
            <input
                type="email"
                name="email"
                value={citizen.email}
                onChange={handleChange}
                placeholder="Email"
            />
            {/* Add other fields as necessary */}
            <button type="submit">Sign Up</button>
        </form>
    );
};

export default Signup;

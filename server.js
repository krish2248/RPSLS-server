const helmet = require('helmet');
app.use(helmet());

require('dotenv').config(); // Load environment variables

const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json()); // Allows JSON parsing in requests
app.use(helmet()); // Adds security headers

// Enforce HTTPS redirection
app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
});

// CORS Configuration (Restrict to Frontend)
app.use(cors({
    origin: 'https://rpsls.online', // Only allow this origin
    methods: ['GET', 'POST'],
    credentials: true
}));

// Rate Limiting: Protects against DDoS attacks
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Max 100 requests per IP
    message: 'Too many requests, please try again later.',
});
app.use(limiter);

// Load environment variables
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || '6278bc0eb053f32016c0f98392ff73d8ecc64f7df84d85098ffeafb8802aee42';

// Create HTTP server
const server = http.createServer(app);

// Create instance of socket.io server with secure CORS
const io = new Server(server, {
    cors: {
        origin: 'https://rpsls.online', // Only allow frontend access
        methods: ['GET', 'POST']
    }
});

// Middleware: Authenticate WebSocket Connections
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
        return next(new Error('Authentication error: No token provided'));
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        socket.user = decoded; // Attach user info to socket
        next();
    } catch (error) {
        next(new Error('Authentication error: Invalid token'));
    }
});

let choices = { p1Choice: null, p2Choice: null };

// WebSocket Connection Handling
io.on('connection', socket => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-room', room => {
        socket.join(room);

        let roomSockets = io.sockets.adapter.rooms.get(room);
        let users = roomSockets ? [...roomSockets.keys()] : [];

        if (users.length > 2) {
            io.to(socket.id).emit('full', `Sorry! Two players are already in this room.`);
            socket.leave(room);
            return;
        }

        io.to(room).emit('updated-users', users);

        socket.on('game-play', () => {
            socket.broadcast.to(room).emit('status', 'Opponent picked! Your turn.');
        });

        socket.on('restart', () => {
            socket.broadcast.to(room).emit('restart-message', 'Opponent wants to play again');
        });

        socket.on('disconnect', () => {
            io.to(room).emit('disconnected', 'Opponent left the game');
        });

        socket.on('p1Choice', data => handleChoice(data, 'p1Choice', room));
        socket.on('p2Choice', data => handleChoice(data, 'p2Choice', room));
    });
});

// Function to handle player choices
const handleChoice = (data, player, room) => {
    const { choice } = data;
    choices[player] = choice;
    io.to(room).emit(player, { choice });

    if (choices.p1Choice !== null && choices.p2Choice !== null) {
        declareWinner(room);
    }
};

// Function to determine the winner
const declareWinner = room => {
    const player1 = choices['p1Choice'];
    const player2 = choices['p2Choice'];
    let winner = '';

    const winConditions = {
        scissors: ['paper', 'lizard'],
        paper: ['rock', 'spock'],
        rock: ['lizard', 'scissors'],
        lizard: ['spock', 'paper'],
        spock: ['scissors', 'rock'],
    };

    if (player1 === player2) {
        winner = 'draw';
    } else if (winConditions[player1]?.includes(player2)) {
        winner = 'player1';
    } else {
        winner = 'player2';
    }

    io.to(room).emit('result', { winner });

    choices = { p1Choice: null, p2Choice: null };
};

// Login Endpoint: Generate JWT Token
app.post('/login', (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    // Generate a token valid for 24 hours
    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '24h' });

    res.json({ token });
});

// Start the server
server.listen(PORT, () => {
    console.log(`🚀 Secure Server running on Port ${PORT}`);
});

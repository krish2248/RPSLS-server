require('dotenv').config(); // Load environment variables

const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const cors = require('cors');

const app = express();
app.use(cors());

// Create http server
const server = http.createServer(app);

// Create instance of socket.io server
const io = new Server(server, {
	cors: {
		origin: '*',
	},
});

// Define PORT from environment variables or use default
const PORT = process.env.PORT || 4000;

let choices = { p1Choice: null, p2Choice: null };

io.on('connection', socket => {
	// Listen join-room event
	socket.on('join-room', room => {
		// Connect the socket to the specified room
		socket.join(room);

		// Emit connected event to the client
		io.to(room).emit('connected');

		// Get users at a particular room
		let roomSockets = io.sockets.adapter.rooms.get(room);
		let users = roomSockets ? [...roomSockets.keys()] : [];

		// If users exceed 2, remove the extra player
		if (users.length > 2) {
			io.to(socket.id).emit('full', `Sorry! Two players are already in this room.`);
			socket.leave(room);
			return;
		}

		// Emit updated users to the client
		io.to(room).emit('updated-users', users);

		// Listen for game-play event
		socket.on('game-play', () => {
			socket.broadcast.to(room).emit('status', 'Opponent picked! Your turn.');
		});

		// Listen for restart event
		socket.on('restart', () => {
			socket.broadcast.to(room).emit('restart-message', 'Opponent wants to play again');
		});

		// Handle player disconnection
		socket.on('disconnect', () => {
			io.to(room).emit('disconnected', 'Opponent left the game');
		});

		// Handle player choices
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

	// Emit the result to the client
	io.to(room).emit('result', { winner });

	// Reset choices for the next round
	choices = { p1Choice: null, p2Choice: null };
};

// Start the server
server.listen(PORT, () => {
	console.log(`Server running on Port ${PORT}`);
});

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
  },
});

let rooms = {}; // Tracks users and their Bingo cards in rooms
let turnStatus = {}; // Tracks turn activity in rooms

// Generate a Bingo card
function generateBingoCard() {
  const numbers = Array.from({ length: 25 }, (_, i) => i + 1);
  const shuffled = numbers.sort(() => Math.random() - 0.5);
  const card = [];
  for (let i = 0; i < 5; i++) {
    card.push(shuffled.slice(i * 5, i * 5 + 5));
  }
  return card;
}

// Check for Bingo conditions
function checkBingo(card, markedNumbers) {
  const size = 5;
  let bingos = 0;

  // Check rows for bingo
  for (let i = 0; i < size; i++) {
    if (card[i].every((num) => markedNumbers.includes(num))) {
      bingos++;
    }
  }

  // Check columns for bingo
  for (let i = 0; i < size; i++) {
    if (card.map((row) => row[i]).every((num) => markedNumbers.includes(num))) {
      bingos++;
    }
  }

  // Check diagonals for bingo
  const diagonal1 = [];
  const diagonal2 = [];
  for (let i = 0; i < size; i++) {
    diagonal1.push(card[i][i]);
    diagonal2.push(card[i][size - i - 1]);
  }

  if (diagonal1.every((num) => markedNumbers.includes(num))) {
    bingos++;
  }

  if (diagonal2.every((num) => markedNumbers.includes(num))) {
    bingos++;
  }

  return bingos; // Return total number of bingos (row + column + diagonal)
}


io.on("connection", (socket) => {
  socket.on("joinRoom", ({ name, room }) => {
    socket.join(room);

    // Add the user to the room with an unmarked card
    if (!rooms[room]) {
      rooms[room] = [];
    }
    if (!turnStatus[room]) turnStatus[room] = {};
    const user = { name, card: generateBingoCard(), marked: [] };
    rooms[room].push(user);
    turnStatus[room][name] = false; // Initialize turn status

    // Notify everyone in the room about the new user
    socket.to(room).emit("userJoined", name);

    // Send updated user list to all users in the room
    io.to(room).emit("roomUpdate", rooms[room]); // Send the entire user objects, not just names


    // Send Bingo card to the joined user
    socket.emit("bingoCard", user.card);

    socket.on("markNumber", ({ number }) => {
      if (!rooms[room]) return;
    
      // Mark the number for all users in the room
      rooms[room].forEach((user) => {
        if (!user.marked.includes(number)) {
          user.marked.push(number);
        }
      });
    
      let winner = null;
      const roomState = rooms[room].map((user) => {
        // Calculate the total number of bingos (row + column + diagonal)
        const bingos = checkBingo(user.card, user.marked);
    
        // If the user achieves exactly 5 bingos, they win
        if (bingos === 5 && !winner) {
          winner = user.name; // First user to achieve 5 bingos wins
        }
    
        return {
          name: user.name,
          card: user.card,
          marked: user.marked,
          bingos, // Track the total bingos for the user
        };
      });
    
      // Notify all users in the room about the updated state
      io.to(room).emit("updateRoomState", { roomState, winner });
    
      // Announce the winner if there is one
      if (winner) {
        io.to(room).emit("gameOver", { winner });
      }
    });
    
    // Handle user disconnect
    socket.on("disconnect", () => {
      if (rooms[room]) {
        rooms[room] = rooms[room].filter((user) => user.name !== name);
        io.to(room).emit("roomUpdate", rooms[room].map((user) => user.name));
      }
    });
  });
});

server.listen(4000, () => {
  console.log("Server is running on http://localhost:4000");
});

const greeting = document.getElementById('greeting');
const actionButton = document.getElementById('action-button');

const messages = [
    "Welcome to your new page!",
    "Keep building!",
    "You are doing great!",
    "Explore and create!"
];

let messageIndex = 0;

actionButton.addEventListener('click', () => {
    messageIndex = (messageIndex + 1) % messages.length;
    greeting.textContent = messages[messageIndex];
});

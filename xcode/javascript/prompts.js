const prompts = [
    "What do you know about Hobbits?",
    "What is quantum field theory?",
    "Why did the chicken cross the road?",
    "Who is the president of the United States?",
    "How do I run CMake on MacOS?",
    "Do you agree that C++ is a really finicky language compared with Python3?",
    "Is it a good idea to invest in technology?",
    "Do you like Wagner's Ring?",
    "Do you think this file input option is really neat?",
    "What should we all do about climate change?",
    "Is time-travel possible within the laws of current physics?",
    "Is it like anything to be a bat?",
    "Once the chicken has crossed the road, does it try to go back?",
    "Who is the greatest of all musical composers?",
    "What is art?",
    "Is there life elsewhere in the universe?",
    "What is intelligence?",
    "What is the difference between knowledge and intelligence?",
    "Will religion ever die?",
    "Do we understand ourselves?",
    "What is the best way to cook eggs?",
    "If you cannot see things, on what basis do you evaluate them?",
    "Explain the role of the np junction in photovoltaic cells?",
    "Is professional sport a good or bad influence on human behaviour?",
    "Is capital punishment immoral?",
    "Should we care about other people?",
    "Who are you?",
    "Which sense would you surrender if you could?",
    "Was Henry Ford a hero or a villain?",
    "Do we need leaders?",
    "What is nucleosynthesis?",
    "Who is the greatest scientist of all time?",
    "Who first observed what came to be known as the photovoltaic effect?",
    "What is nuclear fusion and why does it release energy?",
    "Can you know that you exist?",
    "What is an exoplanet?",
    "Do you like cream?",
    "What is the difference?",
    "Can I know that I exist while I'm dreaming that I'm Descartes?",
    "Who said \"I didn't know I thought that until I heard myself saying it\"?",
    "Does anything really matter?",
    "Can you explain the unreasonable effectiveness of mathematics?"
];

// Seed random function using current time
function seedRandom() {
    const seed = new Date().getTime() % 1e9; // Get milliseconds timestamp as seed
    Math.random = (function(seed) {
        return function() {
            const x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        };
    })(seed);
}

// Function to get a random prompt
function random_prompt() {
    return prompts[Math.floor(Math.random() * prompts.length)];
}

// Seed the random function when module is loaded
seedRandom();

// Export functions and array
export { prompts, random_prompt };

/**
 * Daily quote bank for Hermes.
 * Quote of the day is selected deterministically by date so it rotates
 * at midnight and stays consistent throughout the day.
 */

const QUOTES: { text: string; author: string }[] = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Every client you have is a person who chose you over everyone else.", author: "Unknown" },
  { text: "Trust is the glue of life. It's the most essential ingredient in effective communication.", author: "Stephen Covey" },
  { text: "Your most unhappy customers are your greatest source of learning.", author: "Bill Gates" },
  { text: "People don't care how much you know until they know how much you care.", author: "Theodore Roosevelt" },
  { text: "The goal is not to do business with everybody who needs what you have. The goal is to do business with people who believe what you believe.", author: "Simon Sinek" },
  { text: "Success is not the key to happiness. Happiness is the key to success.", author: "Albert Schweitzer" },
  { text: "A goal without a plan is just a wish.", author: "Antoine de Saint-Exupéry" },
  { text: "The best investment you can make is in yourself.", author: "Warren Buffett" },
  { text: "Financial planning is not about predicting the future. It's about preparing for it.", author: "Unknown" },
  { text: "Do what you do so well that they will want to see it again and bring their friends.", author: "Walt Disney" },
  { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "It's not about having the right opportunities. It's about handling the opportunities right.", author: "Mark Hunter" },
  { text: "Relationships are the currency of business.", author: "Unknown" },
  { text: "Risk comes from not knowing what you're doing.", author: "Warren Buffett" },
  { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { text: "Someone is sitting in the shade today because someone planted a tree a long time ago.", author: "Warren Buffett" },
  { text: "The most important investment you can make is in your relationships.", author: "Unknown" },
  { text: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "The harder I work, the luckier I get.", author: "Gary Player" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Clients don't care about your process. They care about their outcome.", author: "Unknown" },
  { text: "Your network is your net worth.", author: "Porter Gale" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "Prospecting is the lifeblood of a financial adviser's practice.", author: "Unknown" },
  { text: "Never let the fear of striking out keep you from playing the game.", author: "Babe Ruth" },
  { text: "Success is walking from failure to failure with no loss of enthusiasm.", author: "Winston Churchill" },
  { text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
  { text: "Courage is what it takes to stand up and speak. Courage is also what it takes to sit down and listen.", author: "Winston Churchill" },
  { text: "Champions keep playing until they get it right.", author: "Billie Jean King" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { text: "Act as if what you do makes a difference. It does.", author: "William James" },
  { text: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { text: "The only limit to our realization of tomorrow is our doubts of today.", author: "Franklin D. Roosevelt" },
  { text: "What you do today can improve all your tomorrows.", author: "Ralph Marston" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "If you're going through hell, keep going.", author: "Winston Churchill" },
  { text: "I find that the harder I work, the more luck I seem to have.", author: "Thomas Jefferson" },
  { text: "Don't be pushed around by the fears in your mind. Be led by the dreams in your heart.", author: "Roy T. Bennett" },
  { text: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
  { text: "The secret to getting ahead is getting started.", author: "Agatha Christie" },
  { text: "Good things come to people who wait, but better things come to those who go out and get them.", author: "Unknown" },
  { text: "If you want to lift yourself up, lift up someone else.", author: "Booker T. Washington" },
  { text: "I am not a product of my circumstances. I am a product of my decisions.", author: "Stephen Covey" },
  { text: "When everything seems to be going against you, remember that the airplane takes off against the wind.", author: "Henry Ford" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "When I let go of what I am, I become what I might be.", author: "Lao Tzu" },
  { text: "Life is not measured by the number of breaths we take, but by the moments that take our breath away.", author: "Maya Angelou" },
  { text: "If you look at what you have in life, you'll always have more.", author: "Oprah Winfrey" },
  { text: "Life is what happens to you while you're busy making other plans.", author: "John Lennon" },
  { text: "You only live once, but if you do it right, once is enough.", author: "Mae West" },
  { text: "In order to write about life first you must live it.", author: "Ernest Hemingway" },
  { text: "The big lesson in life is never be scared of anyone or anything.", author: "Frank Sinatra" },
  { text: "Sing like no one's listening, love like you've never been hurt, dance like nobody's watching.", author: "Mark Twain" },
  { text: "Curiosity about life in all of its aspects is still the secret of great creative people.", author: "Leo Burnett" },
  { text: "Life is not what you alone make it. Life is the input of everyone who touched your life.", author: "Yolanda King" },
  { text: "Keep smiling, because life is a beautiful thing and there's so much to smile about.", author: "Marilyn Monroe" },
];

/**
 * Returns today's quote, rotating deterministically by date.
 * The same date always returns the same quote.
 */
export function getQuoteOfTheDay(dateIso: string): { text: string; author: string } {
  // Simple but consistent hash: sum of char codes of the date string
  const hash = dateIso.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return QUOTES[hash % QUOTES.length];
}

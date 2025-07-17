const adminCommands = require('./admin');
const documentCommands = require('./documents');
const generalCommands = require('./general');
const ownerCommands = require('./owner');

module.exports = {
    ...adminCommands,
    ...documentCommands,
    ...generalCommands,
    ...ownerCommands
}; 
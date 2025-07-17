class FuzzySearch {
    static search(query, filename) {
        const queryLower = query.toLowerCase();
        const filenameLower = filename.toLowerCase();
        
        // Exact match gets highest score
        if (filenameLower === queryLower) return 100;
        
        // Starts with query gets high score
        if (filenameLower.startsWith(queryLower)) return 90;
        
        // Contains query gets medium score
        if (filenameLower.includes(queryLower)) return 70;
        
        // Check if all query characters exist in filename (order doesn't matter)
        const queryChars = queryLower.split('');
        const filenameChars = filenameLower.split('');
        let queryIndex = 0;
        
        for (let i = 0; i < filenameChars.length && queryIndex < queryChars.length; i++) {
            if (filenameChars[i] === queryChars[queryIndex]) {
                queryIndex++;
            }
        }
        
        if (queryIndex === queryChars.length) return 50; // All characters found in order
        
        // Simple character overlap scoring
        const commonChars = queryChars.filter(char => filenameChars.includes(char)).length;
        return (commonChars / queryChars.length) * 30;
    }
}

module.exports = FuzzySearch; 
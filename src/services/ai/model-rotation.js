class ModelRotation {
    constructor(modelRotation) {
        this.modelRotation = modelRotation;
        this.currentModelIndex = 0;
    }

    getCurrentModel() {
        const current = this.modelRotation[this.currentModelIndex];
        return current.client.getGenerativeModel({ model: current.model });
    }

    getCurrentModelInfo() {
        return this.modelRotation[this.currentModelIndex];
    }

    switchToNextModel() {
        this.currentModelIndex = (this.currentModelIndex + 1) % this.modelRotation.length;
        const current = this.modelRotation[this.currentModelIndex];
        console.log(`🔄 Switched to: ${current.model} (${current.keyName})`);
        return current;
    }

    getTotalModelCount() {
        return this.modelRotation.length;
    }

    resetToFirstModel() {
        this.currentModelIndex = 0;
    }
}

module.exports = ModelRotation; 
export class Password {
    private readonly value: string;

    constructor(password: string) {
        this.validate(password);
        this.value = password;
    }

    private validate(password: string): void {
        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters long');
        }
    }

    getValue(): string {
        return this.value;
    }
}

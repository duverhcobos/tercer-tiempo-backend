export class Email {
    private readonly value: string;

    constructor(email: string) {
        this.validate(email);
        this.value = email;
    }

    private validate(email: string): void {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Invalid email address');
        }
    }

    getValue(): string {
        return this.value;
    }
}

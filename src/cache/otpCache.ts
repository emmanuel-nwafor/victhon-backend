import { OTPType, UserType } from "../types/constants";
import BaseCache from "./Base.cache";

interface OTPPayload {
	otp: string;
}

export default class OTPCache extends BaseCache {
	public constructor() {
		// 10 minutes in seconds
		super("otp", 600);
	}

	private buildKey(
		email: string,
		userType: UserType,
		otpType: OTPType = OTPType.Verification,
	) {
		return `${userType}:${otpType}:${email.toLowerCase()}`;
	}

	public async setVerificationOTP(email: string, userType: UserType, otp: string) {
		return this.set(this.buildKey(email, userType), { otp });
	}

	public async getVerificationOTP(email: string, userType: UserType) {
		return this.get(this.buildKey(email, userType));
	}

	public async deleteVerificationOTP(email: string, userType: UserType) {
		return this.delete(this.buildKey(email, userType));
	}
}

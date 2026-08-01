// import { Injectable } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { PassportStrategy } from '@nestjs/passport';
// import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
// import { AuthService } from '../../application/services/auth.service';

// @Injectable()
// export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
//     constructor(
//         private readonly configService: ConfigService,
//         private readonly authService: AuthService,
//     ) {
//         super({
//             clientID: configService.get<string>('GOOGLE_CLIENT_ID')!,
//             clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET')!,
//             callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL')!,
//             scope: ['email', 'profile'],
//         });
//     }

//     async validate(
//         _accessToken: string,
//         _refreshToken: string,
//         profile: Profile,
//         done: VerifyCallback,
//     ): Promise<void> {
//         const { id, emails, photos } = profile;
//         const email = emails?.[0]?.value;
//         const avatarUrl = photos?.[0]?.value;

//         if (!email) {
//             return done(new Error('No email returned from Google'), undefined);
//         }

//         const result = await this.authService.googleLogin({
//             googleId: id,
//             email,
//             avatarUrl,
//         });

//         done(null, result);
//     }
// }

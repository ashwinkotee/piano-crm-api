import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User";
import Account from "../models/Account";

passport.serializeUser((user: any, done: (err: any, id?: any) => void) => done(null, (user as any)._id));
passport.deserializeUser(async (id: string, done: (err: any, user?: any) => void) => {
  const user = await User.findById(id);
  done(null, user);
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
    },
    async (_at: string, _rt: string, profile: any, done: (err: any, user?: any) => void) => {
      const email = profile.emails?.[0]?.value?.toLowerCase();
      if (!email) return done(new Error("No email from Google"));
      let account = await Account.findOne({ provider: "google", providerId: profile.id });
      if (account) {
        const user = await User.findById(account.userId);
        return done(null, user);
      }
      let user = await User.findOne({ email });
      if (!user) {
        user = await User.create({ email, role: "portal", profile: { name: profile.displayName } });
      }
      account = await Account.create({ userId: user._id, provider: "google", providerId: profile.id });
      return done(null, user);
    }
  )
);

export default passport;

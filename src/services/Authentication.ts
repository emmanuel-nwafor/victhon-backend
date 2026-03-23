import axios from "axios";
import OTPCache from "../cache/otpCache";
import TokenBlackList from "../cache/TokenBlacklist";
import env, { EnvKey } from "../config/env";
import { AppDataSource } from "../data-source";
import { Professional } from "../entities/Professional";
import { User } from "../entities/User";
import { HttpStatus, UserType } from "../types/constants";
import deleteFiles from "../utils/deleteFiles";
import { sendOTP, sendPasswordOTP } from "../utils/mailer";
import Password from "../utils/Password";
import Service from "./Service";
import Token from "./Token";
import { AuthProvider } from "../types/constants";

export default class Authentication extends Service {
  protected readonly storedSalt: string = env(EnvKey.STORED_SALT)!;
  protected readonly tokenSecret: string = env(EnvKey.TOKEN_SECRET)!;
  protected readonly secretKey: string = env(EnvKey.SECRET_KEY)!;
  protected readonly tokenBlackListCache: TokenBlackList = new TokenBlackList();
  protected readonly otpCache: OTPCache = new OTPCache();

  private generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async issueVerificationOTP(email: string, userType: UserType) {
    const otp = this.generateOTP();
    const cached = await this.otpCache.setVerificationOTP(email, userType, otp);
    if (!cached) {
      return false;
    }

    await sendOTP(email, otp);
    return true;
  }

  private async issuePasswordResetOTP(email: string, userType: UserType) {
    const otp = this.generateOTP();
    const cached = await this.otpCache.setPasswordResetOTP(email, userType, otp);
    if (!cached) {
      return false;
    }

    await sendPasswordOTP(email, otp);
    return true;
  }

  private generateToken(data: any, role: string, expiresIn: string = "100y") {
    return Token.createToken(this.tokenSecret, data, [role], expiresIn);
  }

  protected generateOTPToken(
    email: string,
    role: string,
    expiresIn: string = "5m",
  ) {
    return this.generateToken({ email: email }, role, expiresIn);
  }

  protected generateUserToken(data: any, role: UserType) {
    return this.generateToken(data, role);
  }

  public async googleAuth(idToken: string, userType: UserType) {
    try {
      const googleResponse = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
      const payload = googleResponse.data;

      if (!payload.email) {
        return this.responseData(400, true, "Invalid Google token");
      }

      const email = payload.email;
      const firstName = payload.given_name || "";
      const lastName = payload.family_name || "";
      const picture = payload.picture || "";

      if (userType === UserType.USER) {
        const userRepo = AppDataSource.getRepository(User);
        let user = await userRepo.findOneBy({ email });

        if (user) {
          user.authProvider = AuthProvider.GOOGLE;
          await userRepo.save(user);
          const token = this.generateUserToken({ id: user.id, userType: UserType.USER }, UserType.USER);

          return this.responseData(200, false, "User has logged in successfully", {
            user: { ...user, password: undefined },
            token,
          });
        } else {
          const newUser = userRepo.create({
            email,
            firstName,
            lastName,
            isVerified: true,
            authProvider: AuthProvider.GOOGLE,
            profilePicture: picture ? { url: picture, publicId: "google_pfp" } : null,
          });

          const savedUser: any = await userRepo.save(newUser);
          const token = this.generateUserToken(
            { id: savedUser.id, userType: UserType.USER },
            UserType.USER,
          );

          return this.responseData(201, false, "User has been created successfully", {
            user: { ...savedUser, password: undefined },
            token,
          });
        }
      } else {
        const professionalRepo = AppDataSource.getRepository(Professional);
        let pro = await professionalRepo.findOneBy({ email });

        if (pro) {
          pro.authProvider = AuthProvider.GOOGLE;
          await professionalRepo.save(pro);
          const token = this.generateUserToken(
            { id: pro.id, userType: UserType.PROFESSIONAL },
            UserType.PROFESSIONAL,
          );

          return this.responseData(200, false, "Professional has logged in successfully", {
            user: { ...pro, password: undefined },
            token,
          });
        } else {
          const newPro = professionalRepo.create({
            email,
            firstName,
            lastName,
            isVerified: true,
            authProvider: AuthProvider.GOOGLE,
            profilePicture: picture ? { url: picture, publicId: "google_pfp" } : null,
            location: `POINT(${0} ${0})` as any,
          });

          const savedPro: any = await professionalRepo.save(newPro);
          const token = this.generateUserToken(
            { id: savedPro.id, userType: UserType.PROFESSIONAL },
            UserType.PROFESSIONAL,
          );

          return this.responseData(201, false, "Professional has been created successfully", {
            user: { ...savedPro, password: undefined },
            token,
          });
        }
      }
    } catch (error: any) {
      console.error("Google Auth Error:", error.response?.data || error.message);
      return this.responseData(401, true, "Google authentication failed");
    }
  }

  public async signUp(email: string, password: string) {
    try {
      const userRepository = AppDataSource.getRepository(User);

      let existingUser = await userRepository.findOneBy({ email: email });
      if (existingUser && existingUser.isVerified) {
        return this.responseData(400, true, `Email already exists.`);
      }

      password = Password.hashPassword(password, this.storedSalt);

      let savedUser: any;

      if (existingUser && !existingUser.isVerified) {
        existingUser.password = password;
        savedUser = await userRepository.save(existingUser);
      } else {
        const user = userRepository.create({
          email,
          password,
          isVerified: false,
        });
        savedUser = await userRepository.save(user);
      }

      const otpIssued = await this.issueVerificationOTP(email, UserType.USER);
      if (!otpIssued) {
        return this.responseData(
          HttpStatus.INTERNAL_SERVER_ERROR,
          true,
          "Unable to issue OTP at the moment. Please try again.",
        );
      }

      const data = {
        user: {
          ...savedUser,
          password: undefined,
        },
        requiresVerification: true,
      };

      return this.responseData(
        201,
        false,
        "User has been created successfully. Please verify your email with the OTP sent.",
        data,
      );
    } catch (error) {
      console.error("Error in signUp service:", error);
      return super.handleTypeormError(error);
    }
  }

  public async signUps(signUpData: any) {
    try {
      const userRepo = AppDataSource.getRepository(User);

      let userEmailExists = await userRepo.findOneBy({
        email: signUpData.email,
      });
      if (userEmailExists) {
        if (signUpData.file) await deleteFiles(signUpData.file);
        return this.responseData(400, true, `Email already exists.`);
      }

      let userPhoneNumberExists = await userRepo.findOneBy({
        phone: signUpData.phone,
      });
      if (userPhoneNumberExists) {
        if (signUpData.file) await deleteFiles(signUpData.file);
        return this.responseData(400, true, `Phone number already exists.`);
      }

      signUpData.password = Password.hashPassword(
        signUpData.password,
        this.storedSalt,
      );
      const user = userRepo.create({
        ...signUpData,
        location: `POINT(${signUpData.lng} ${signUpData.lat})`,
      });

      const savedUser: any = await userRepo.save(user);

      const token = this.generateUserToken(
        { id: savedUser.id, userType: UserType.USER },
        UserType.USER,
      );
      const data = {
        user: {
          ...savedUser,
          longitude: signUpData.lng,
          latitude: signUpData.lat,
          location: undefined,
          password: undefined,
        },
        token: token,
      };
      return this.responseData(
        201,
        false,
        "User has been created successfully",
        data,
      );
    } catch (error) {
      return super.handleTypeormError(error);
    }
  }

  // * User(normal user) login service
  public async login(email: string, password: string) {
    try {
      const userRepo = AppDataSource.getRepository(User);

      let result = await userRepo
        .createQueryBuilder("user")
        .addSelect("user.password")
        .where("user.email = :email", { email })
        .getOne();

      if (result) {
        const user = result;
        const hashedPassword = user.password;
        const validPassword = Password.compare(
          password,
          hashedPassword,
          this.storedSalt,
        );

        if (validPassword) {
          if (!user.isVerified) {
            return super.responseData(
              HttpStatus.FORBIDDEN,
              true,
              "Please verify your email before logging in",
            );
          }

          const token = this.generateUserToken(
            { id: user.id, userType: UserType.USER },
            UserType.USER,
          );

          const data = {
            user: {
              ...user,
              password: undefined,
            },
            token: token,
          };
          return this.responseData(
            200,
            false,
            "User has been logged in successfully",
            data,
          );
        }
        return super.responseData(
          HttpStatus.BAD_REQUEST,
          true,
          "Invalid password",
        );
      }
      return this.responseData(404, true, "User was not found");
    } catch (error) {
      return super.handleTypeormError(error);
    }
  }

  public async professionalSignUp(email: string, password: string) {
    try {
      const professionalRepo = AppDataSource.getRepository(Professional);

      let existingUser = await professionalRepo.findOneBy({ email: email });
      if (existingUser && existingUser.isVerified) {
        return this.responseData(400, true, `Email already exists.`);
      }

      password = Password.hashPassword(password, this.storedSalt);

      let savedUser: any;

      if (existingUser && !existingUser.isVerified) {
        existingUser.password = password;
        savedUser = await professionalRepo.save(existingUser);
      } else {
        const user = professionalRepo.create({
          email,
          password,
          location: `POINT(${0} ${0})` as any,
          isVerified: false,
        });
        savedUser = await professionalRepo.save(user);
      }

      const otpIssued = await this.issueVerificationOTP(
        email,
        UserType.PROFESSIONAL,
      );
      if (!otpIssued) {
        return this.responseData(
          HttpStatus.INTERNAL_SERVER_ERROR,
          true,
          "Unable to issue OTP at the moment. Please try again.",
        );
      }

      const data = {
        user: {
          ...savedUser,
          password: undefined,
        },
        requiresVerification: true,
      };

      return this.responseData(
        201,
        false,
        "User has been created successfully. Please verify your email with the OTP sent.",
        data,
      );
    } catch (error) {
      return super.handleTypeormError(error);
    }
  }

  // public async professionalSignUp(signUpData: any) {
  //     try {
  //         const professionalRepo = AppDataSource.getRepository(Professional);

  //         let userEmailExists = await professionalRepo.findOneBy({ email: signUpData.email });
  //         if (userEmailExists) {
  //             if (signUpData.files) await deleteFiles(signUpData.files);
  //             return this.responseData(400, true, `Email already exists.`);
  //         }

  //         let userPhoneNumberExists = await professionalRepo.findOneBy({ phone: signUpData.phone });
  //         if (userPhoneNumberExists) {
  //             if (signUpData.files) await deleteFiles(signUpData.files);
  //             return this.responseData(400, true, `Phone number already exists.`);
  //         }

  //         signUpData.password = Password.hashPassword(signUpData.password, this.storedSalt);

  //         const user = professionalRepo.create({
  //             ...signUpData,
  //             location: `POINT(${signUpData.longitude} ${signUpData.latitude})`,
  //         });

  //         const savedUser: any = (await professionalRepo.save(user))

  //         const token = this.generateUserToken({
  //             id: savedUser.id,
  //             userType: UserType.PROFESSIONAL
  //         }, UserType.PROFESSIONAL);
  //         const data = {
  //             user: {
  //                 ...savedUser,
  //                 longitude: signUpData.longitude,
  //                 latitude: signUpData.latitude,
  //                 location: undefined,
  //                 password: undefined
  //             },
  //             token: token,
  //         };

  //         return this.responseData(201, false, "User has been created successfully", data);
  //     } catch (error) {
  //         return super.handleTypeormError(error);
  //     }
  // }

  public async professionalLogin(email: string, password: string) {
    try {
      const professionalRepo = AppDataSource.getRepository(Professional);

      let result = await professionalRepo
        .createQueryBuilder("professional")
        .addSelect("professional.password")
        .where("professional.email = :email", { email })
        .getOne();

      if (result) {
        const user = result;
        const hashedPassword = user.password;
        const validPassword = Password.compare(
          password,
          hashedPassword,
          this.storedSalt,
        );

        if (validPassword) {
          if (!user.isVerified) {
            return super.responseData(
              HttpStatus.FORBIDDEN,
              true,
              "Please verify your email before logging in",
            );
          }

          const token = this.generateUserToken(
            {
              id: user.id,
              userType: UserType.PROFESSIONAL,
            },
            UserType.PROFESSIONAL,
          );
          const coords = (user.location as any)
            .replace("POINT(", "")
            .replace(")", "")
            .split(" ");

          const data = {
            user: {
              ...user,
              longitude: parseFloat(coords[0]),
              latitude: parseFloat(coords[1]),
              location: undefined,
              password: undefined,
            },
            token: token,
          };
          return this.responseData(
            200,
            false,
            "User has been logged in successfully",
            data,
          );
        }
        return super.responseData(
          HttpStatus.BAD_REQUEST,
          true,
          "Invalid password",
        );
      }
      return this.responseData(404, true, "User was not found");
    } catch (error) {
      return super.handleTypeormError(error);
    }
  }

  public async verifyOTP(email: string, otp: string, userType: UserType) {
    try {
      const otpResult = await this.otpCache.getVerificationOTP(email, userType);
      if (otpResult.error) {
        return this.responseData(
          HttpStatus.INTERNAL_SERVER_ERROR,
          true,
          "Unable to verify OTP at the moment. Please try again.",
        );
      }

      if (!otpResult.data || otpResult.data.otp !== otp) {
        return this.responseData(
          HttpStatus.BAD_REQUEST,
          true,
          "Invalid or expired OTP",
        );
      }

      if (userType === UserType.USER) {
        const userRepo = AppDataSource.getRepository(User);
        const user = await userRepo.findOneBy({ email });

        if (!user) {
          return this.responseData(HttpStatus.NOT_FOUND, true, "User was not found");
        }

        user.isVerified = true;
        const savedUser: any = await userRepo.save(user);
        await this.otpCache.deleteVerificationOTP(email, userType);

        const token = this.generateUserToken(
          { id: savedUser.id, userType: UserType.USER },
          UserType.USER,
        );

        return this.responseData(200, false, "OTP verified successfully", {
          user: {
            ...savedUser,
            password: undefined,
          },
          token,
        });
      }

      const professionalRepo = AppDataSource.getRepository(Professional);
      const professional = await professionalRepo.findOneBy({ email });

      if (!professional) {
        return this.responseData(HttpStatus.NOT_FOUND, true, "User was not found");
      }

      professional.isVerified = true;
      const savedProfessional: any = await professionalRepo.save(professional);
      await this.otpCache.deleteVerificationOTP(email, userType);

      const token = this.generateUserToken(
        { id: savedProfessional.id, userType: UserType.PROFESSIONAL },
        UserType.PROFESSIONAL,
      );

      const coords = (savedProfessional.location as any)
        .replace("POINT(", "")
        .replace(")", "")
        .split(" ");

      return this.responseData(200, false, "OTP verified successfully", {
        user: {
          ...savedProfessional,
          longitude: parseFloat(coords[0]),
          latitude: parseFloat(coords[1]),
          location: undefined,
          password: undefined,
        },
        token,
      });
    } catch (error) {
      return super.handleTypeormError(error);
    }
  }

  public async resendOTP(email: string, userType: UserType) {
    try {
      if (userType === UserType.USER) {
        const userRepo = AppDataSource.getRepository(User);
        const user = await userRepo.findOneBy({ email });

        if (!user) {
          return this.responseData(HttpStatus.NOT_FOUND, true, "User was not found");
        }

        if (user.isVerified) {
          return this.responseData(
            HttpStatus.BAD_REQUEST,
            true,
            "This account has already been verified",
          );
        }
      } else {
        const professionalRepo = AppDataSource.getRepository(Professional);
        const professional = await professionalRepo.findOneBy({ email });

        if (!professional) {
          return this.responseData(HttpStatus.NOT_FOUND, true, "User was not found");
        }

        if (professional.isVerified) {
          return this.responseData(
            HttpStatus.BAD_REQUEST,
            true,
            "This account has already been verified",
          );
        }
      }

      const otpIssued = await this.issueVerificationOTP(email, userType);
      if (!otpIssued) {
        return this.responseData(
          HttpStatus.INTERNAL_SERVER_ERROR,
          true,
          "Unable to issue OTP at the moment. Please try again.",
        );
      }

      return this.responseData(
        HttpStatus.OK,
        false,
        "A new OTP has been sent to your email",
      );
    } catch (error) {
      return super.handleTypeormError(error);
    }
  }

  public async forgotPassword(email: string, userType: UserType) {
    try {
      const repo = userType === UserType.USER
        ? AppDataSource.getRepository(User)
        : AppDataSource.getRepository(Professional);

      const user = await repo.findOneBy({ email });
      if (!user) {
        // Return success even if email not found to prevent email enumeration
        return this.responseData(
          HttpStatus.OK,
          false,
          "If an account with that email exists, an OTP has been sent.",
        );
      }

      const otpIssued = await this.issuePasswordResetOTP(email, userType);
      if (!otpIssued) {
        return this.responseData(
          HttpStatus.INTERNAL_SERVER_ERROR,
          true,
          "Unable to send OTP at the moment. Please try again.",
        );
      }

      return this.responseData(
        HttpStatus.OK,
        false,
        "If an account with that email exists, an OTP has been sent.",
      );
    } catch (error) {
      return super.handleTypeormError(error);
    }
  }

  public async verifyPasswordResetOTP(email: string, otp: string, userType: UserType) {
    try {
      const otpResult = await this.otpCache.getPasswordResetOTP(email, userType);
      if (otpResult.error) {
        return this.responseData(
          HttpStatus.INTERNAL_SERVER_ERROR,
          true,
          "Unable to verify OTP at the moment. Please try again.",
        );
      }

      if (!otpResult.data || otpResult.data.otp !== otp) {
        return this.responseData(
          HttpStatus.BAD_REQUEST,
          true,
          "Invalid or expired OTP",
        );
      }

      await this.otpCache.deletePasswordResetOTP(email, userType);
      await this.otpCache.setPasswordResetVerified(email, userType);

      return this.responseData(HttpStatus.OK, false, "OTP verified successfully");
    } catch (error) {
      return super.handleTypeormError(error);
    }
  }

  public async resetPassword(email: string, newPassword: string, userType: UserType) {
    try {
      const verifiedResult = await this.otpCache.getPasswordResetVerified(email, userType);
      if (verifiedResult.error || !verifiedResult.data?.verified) {
        return this.responseData(
          HttpStatus.BAD_REQUEST,
          true,
          "Password reset not authorized. Please verify your OTP first.",
        );
      }

      await this.otpCache.deletePasswordResetVerified(email, userType);
      const hashedPassword = Password.hashPassword(newPassword, this.storedSalt);

      if (userType === UserType.USER) {
        const userRepo = AppDataSource.getRepository(User);
        const user = await userRepo.findOneBy({ email });
        if (!user) {
          return this.responseData(HttpStatus.NOT_FOUND, true, "User was not found");
        }
        user.password = hashedPassword;
        await userRepo.save(user);
      } else {
        const professionalRepo = AppDataSource.getRepository(Professional);
        const user = await professionalRepo.findOneBy({ email });
        if (!user) {
          return this.responseData(HttpStatus.NOT_FOUND, true, "User was not found");
        }
        user.password = hashedPassword;
        await professionalRepo.save(user);
      }

      return this.responseData(
        HttpStatus.OK,
        false,
        "Password has been reset successfully",
      );
    } catch (error) {
      return super.handleTypeormError(error);
    }
  }
}

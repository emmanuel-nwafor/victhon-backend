import { NotificationType } from "../entities/Notification";

export function getNotificationContent(type: string, data: any) {
    const overrideTitle = data?.title;
    const overrideBody = data?.body || data?.message || data?.content;

    switch (type) {
        case NotificationType.BOOKING:
            return { 
                title: overrideTitle || "New Booking Request", 
                body: overrideBody || `You have received a new booking request for ${data?.serviceName || "your service"}.` 
            };
        case NotificationType.ACCEPTED_BOOKING:
            return { 
                title: overrideTitle || "Booking Confirmed!", 
                body: overrideBody || "Great news! Your booking has been accepted by the professional." 
            };
        case NotificationType.REJECTED_BOOKING:
            return { 
                title: overrideTitle || "Booking Request Update", 
                body: overrideBody || "Your booking request was unfortunately rejected. Explore other similar services!" 
            };
        case NotificationType.VIEW_PROFILE:
            return { 
                title: overrideTitle || "New Profile Visitor", 
                body: overrideBody || "Someone is interested in your services and just viewed your profile." 
            };
        case NotificationType.BOOKING_PAYMENT:
            return { 
                title: overrideTitle || "Payment Confirmed", 
                body: overrideBody || "We've received your payment. Your booking status is now updated." 
            };
        case NotificationType.CANCEL_BOOKING:
            return { 
                title: overrideTitle || "Booking Cancelled", 
                body: overrideBody || "A booking has been cancelled by the other party." 
            };
        case NotificationType.DISPUTED:
            return { 
                title: overrideTitle || "Dispute Opened", 
                body: overrideBody || "A dispute has been initiated for one of your bookings. Our team will review it shortly." 
            };
        case NotificationType.NEW_REVIEW:
            const rating = data?.rating || data?.review?.rating || "new";
            return { 
                title: overrideTitle || "New Review Received", 
                body: overrideBody || `Someone left a ${rating} star review on your profile.` 
            };
        case NotificationType.CHAT:
            const senderName = data?.senderName || "A user";
            return { 
                title: overrideTitle || "New Message", 
                body: overrideBody || `${senderName}: ${data?.content || "Sent you a message"}` 
            };
        case NotificationType.ON_THE_WAY:
            return { 
                title: overrideTitle || "Professional En Route", 
                body: overrideBody || "The service provider has started moving to your location." 
            };
        case NotificationType.COMPLETED:
            return { 
                title: overrideTitle || "Service Completed", 
                body: overrideBody || "The job is done! Please take a moment to review your experience." 
            };
        case NotificationType.REVIEW_BOOKING:
            return { 
                title: overrideTitle || "Review Requested", 
                body: overrideBody || "The professional has finished the job. Please verify and release payment." 
            };
        case NotificationType.ESCROW_RELEASE:
            return { 
                title: overrideTitle || "Funds Into Wallet", 
                body: overrideBody || "Success! The escrow payment has been released to your wallet." 
            };
        case NotificationType.REFUND_FAILED:
            return { 
                title: overrideTitle || "Refund Issue", 
                body: overrideBody || "There was an error processing your refund. Please contact Victhon support." 
            };
        case NotificationType.REFUNDED_BOOKING:
            return { 
                title: overrideTitle || "Refund Successful", 
                body: overrideBody || "Your booking payment has been successfully refunded to your source." 
            };
        case NotificationType.WELCOME:
            return { 
                title: overrideTitle || "Welcome to Victhon!", 
                body: overrideBody || "Your account is ready! Start exploring high-quality professional services near you." 
            };
        default:
            if (overrideBody) {
                return { 
                    title: overrideTitle || "Update from Victhon", 
                    body: overrideBody
                };
            }
            return { 
                title: overrideTitle || "Notification", 
                body: "You have a new update in your Victhon account." 
            };
    }
}

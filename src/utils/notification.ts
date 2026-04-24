import { NotificationType } from "../entities/Notification";

export function getNotificationContent(type: string, data: any) {
    if (data?.message || data?.body || data?.content) {
        return { 
            title: data?.title || "Update from Victhon", 
            body: data?.message || data?.body || data?.content
        };
    }

    switch (type) {
        case NotificationType.BOOKING:
            return { 
                title: "New Booking Request", 
                body: `You have received a new booking request for ${data?.serviceName || "your service"}.` 
            };
        case NotificationType.ACCEPTED_BOOKING:
            return { 
                title: "Booking Confirmed!", 
                body: "Great news! Your booking has been accepted by the professional." 
            };
        case NotificationType.REJECTED_BOOKING:
            return { 
                title: "Booking Request Update", 
                body: "Your booking request was unfortunately rejected. Explore other similar services!" 
            };
        case NotificationType.VIEW_PROFILE:
            return { 
                title: "New Profile Visitor", 
                body: "Someone is interested in your services and just viewed your profile." 
            };
        case NotificationType.BOOKING_PAYMENT:
            return { 
                title: "Payment Confirmed", 
                body: "We've received your payment. Your booking status is now updated." 
            };
        case NotificationType.CANCEL_BOOKING:
            return { 
                title: "Booking Cancelled", 
                body: "A booking has been cancelled by the other party." 
            };
        case NotificationType.DISPUTED:
            return { 
                title: "Dispute Opened", 
                body: "A dispute has been initiated for one of your bookings. Our team will review it shortly." 
            };
        case NotificationType.NEW_REVIEW:
            return { 
                title: "New Review Received", 
                body: `Someone left a ${data?.rating || "new"} star review on your profile.` 
            };
        case NotificationType.CHAT:
            const senderName = data?.senderName || "A user";
            return { 
                title: "New Message", 
                body: `${senderName}: "${data?.content || "Sent you a message"}"` 
            };
        case NotificationType.ON_THE_WAY:
            return { 
                title: "Professional En Route", 
                body: "The service provider has started moving to your location." 
            };
        case NotificationType.COMPLETED:
            return { 
                title: "Service Completed", 
                body: "The job is done! Please take a moment to review your experience." 
            };
        case NotificationType.REVIEW_BOOKING:
            return { 
                title: "Review Requested", 
                body: "The professional has finished the job. Please verify and release payment." 
            };
        case NotificationType.ESCROW_RELEASE:
            return { 
                title: "Funds Into Wallet", 
                body: "Success! The escrow payment has been released to your wallet." 
            };
        case NotificationType.REFUND_FAILED:
            return { 
                title: "Refund Issue", 
                body: "There was an error processing your refund. Please contact Victhon support." 
            };
        case NotificationType.REFUNDED_BOOKING:
            return { 
                title: "Refund Successful", 
                body: "Your booking payment has been successfully refunded to your source." 
            };
        case NotificationType.WELCOME:
            return { 
                title: "Welcome to Victhon!", 
                body: "Your account is ready! Start exploring high-quality professional services near you." 
            };
        default:
            return { 
                title: "Notification", 
                body: "You have a new update in your Victhon account." 
            };
    }
}

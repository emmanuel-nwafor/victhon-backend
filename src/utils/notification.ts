import { NotificationType } from "../entities/Notification";

export function getNotificationContent(type: string, data: any) {
    const overrideTitle = data?.title;
    const overrideBody = data?.body || data?.message || data?.content;

    const normalizedType = type?.toLowerCase();

    switch (normalizedType) {
        case NotificationType.BOOKING.toLowerCase():
            return {
                title: overrideTitle || "New Booking Request",
                body: overrideBody || `You have received a new booking request for ${data?.serviceName || "your service"}.`
            };
        case NotificationType.ACCEPTED_BOOKING.toLowerCase():
            return {
                title: overrideTitle || "Booking Confirmed!",
                body: overrideBody || "Great news! Your booking has been accepted by the professional."
            };
        case NotificationType.REJECTED_BOOKING.toLowerCase():
            return {
                title: overrideTitle || "Booking Request Update",
                body: overrideBody || "Your booking request was unfortunately rejected. Explore other similar services!"
            };
        case NotificationType.VIEW_PROFILE.toLowerCase():
            return {
                title: overrideTitle || "New Profile Visitor",
                body: overrideBody || "Someone is interested in your services and just viewed your profile."
            };
        case NotificationType.BOOKING_PAYMENT.toLowerCase():
            return {
                title: overrideTitle || "Payment Confirmed",
                body: overrideBody || "We've received your payment. Your booking status is now updated."
            };
        case NotificationType.CANCEL_BOOKING.toLowerCase():
            return {
                title: overrideTitle || "Booking Cancelled",
                body: overrideBody || "A booking has been cancelled by the other party."
            };
        case NotificationType.DISPUTED.toLowerCase():
            return {
                title: overrideTitle || "Dispute Opened",
                body: overrideBody || "A dispute has been initiated for one of your bookings. Our team will review it shortly."
            };
        case NotificationType.NEW_REVIEW.toLowerCase():
            const rating = data?.rating || data?.review?.rating || "new";
            const reviewer = data?.customerName || "Customer";
            return {
                title: overrideTitle || "New Review Received",
                body: overrideBody || `${reviewer} left a ${rating} star review on your profile.`
            };
        case NotificationType.CHAT.toLowerCase():
            const senderName = data?.senderName || "Customer";
            let chatBody = overrideBody || `${senderName}: ${data?.content || "Sent you a message"}`;
            let imageUrl = null;

            // If it's an attachment, try to get the first one's URL
            if (data?.attachments && Array.isArray(data.attachments) && data.attachments.length > 0) {
                imageUrl = data.attachments[0].url;
                if (!data?.content || data.content === "attachments" || data.content === "Sent an attachment") {
                    chatBody = `${senderName} sent an image 📷`;
                }
            }

            return {
                title: overrideTitle || "New Message",
                body: chatBody,
                imageUrl
            };
        case NotificationType.ON_THE_WAY.toLowerCase():
            return {
                title: overrideTitle || "Professional En Route",
                body: overrideBody || "The service provider has started moving to your location."
            };
        case NotificationType.COMPLETED.toLowerCase():
            return {
                title: overrideTitle || "Service Completed",
                body: overrideBody || "The job is done! Please take a moment to review your experience."
            };
        case NotificationType.REVIEW_BOOKING.toLowerCase():
            return {
                title: overrideTitle || "Review Requested",
                body: overrideBody || "The professional has finished the job. Please verify and release payment."
            };
        case NotificationType.ESCROW_RELEASE.toLowerCase():
            return {
                title: overrideTitle || "Funds Into Wallet",
                body: overrideBody || "Success! The escrow payment has been released to your wallet."
            };
        case NotificationType.REFUND_FAILED.toLowerCase():
            return {
                title: overrideTitle || "Refund Issue",
                body: overrideBody || "There was an error processing your refund. Please contact Victhon support."
            };
        case NotificationType.REFUNDED_BOOKING.toLowerCase():
            return {
                title: overrideTitle || "Refund Successful",
                body: overrideBody || "Your booking payment has been successfully refunded to your source."
            };
        case NotificationType.WELCOME.toLowerCase():
            return {
                title: overrideTitle || "Welcome to Victhon!",
                body: overrideBody || "Your account is ready! Start exploring high-quality professional services near you."
            };
        default:
            if (overrideBody) {
                return {
                    title: overrideTitle || "Update",
                    body: overrideBody
                };
            }
            return {
                title: overrideTitle || "Notification",
                body: "You have a new update in your Victhon account."
            };
    }
}

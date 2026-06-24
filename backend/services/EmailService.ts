import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', // Match your supabase config
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export const EmailService = {
    async sendNewLeadEmail({ emailTo, subject, html }: { emailTo: string; subject: string; html: string }) {
        if (!process.env.SMTP_USER) {
            console.warn('[EmailService] SMTP credentials not found, skipping email send.');
            return false;
        }
        try {
            await transporter.sendMail({
                from: `"Autopilot CRM" <${process.env.SMTP_SENDER_EMAIL || process.env.SMTP_USER}>`,
                to: emailTo,
                subject,
                html,
            });
            console.log(`[EmailService] New lead email sent to ${emailTo}`);
            return true;
        } catch (error) {
            console.error('[EmailService] Failed to send new lead email:', error);
            return false;
        }
    },

    async sendMaterialRequestEmail({
        emailTo,
        ticket,
        property,
        requestedBy,
        requesterRole,
        items
    }: {
        emailTo: string;
        ticket: any;
        property: any;
        requestedBy: any;
        requesterRole?: string;
        items: any[];
    }) {
        if (!process.env.SMTP_USER) {
            console.warn('[EmailService] SMTP credentials not found, skipping email send.');
            return false;
        }

        const subject = `Material Request for Ticket #${ticket.ticket_number}`;
        const itemsHtml = items.map(
            img => `<li><b>${img.name}</b> - Qty: ${img.quantity} ${img.notes ? `(Notes: ${img.notes})` : ''}</li>`
        ).join('');

        const html = `
            <h2>Material Request</h2>
            <p>You have been tagged in a new material request for a ticket.</p>
            
            <h3>Ticket Details</h3>
            <ul>
                <li><b>Ticket:</b> ${ticket.ticket_number} - ${ticket.title}</li>
                <li><b>Property:</b> ${property?.name || 'N/A'}</li>
                <li><b>Requested By:</b> ${requestedBy?.full_name || requestedBy?.email || 'System'} (${requesterRole?.toUpperCase() || 'Support'})</li>
            </ul>

            <h3>Requested Materials</h3>
            <ul>
                ${itemsHtml}
            </ul>

            <p>Please check the Procurement Dashboard to fulfill this request.</p>
        `;

        try {
            await transporter.sendMail({
                from: `"Autopilot Support" <${process.env.SMTP_SENDER_EMAIL || process.env.SMTP_USER}>`,
                to: emailTo,
                subject,
                html,
            });
            console.log(`[EmailService] Material request email sent to ${emailTo}`);
            return true;
        } catch (error) {
            console.error('[EmailService] Failed to send material request email:', error);
            return false;
        }
    }
};

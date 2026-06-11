import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

// Configure email transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_SMTP_PORT || '587'),
    secure: false,
    auth: {
        user: process.env.EMAIL_SMTP_USER,
        pass: process.env.EMAIL_SMTP_PASS,
    },
});

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        // Use service role client for admin operations
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        // Get user by email
        const { data: user, error: userError } = await supabaseAdmin.auth.admin.listUsers();
        const targetUser = user?.users?.find(u => u.email === email);

        if (!targetUser) {
            // Don't reveal if user exists or not for security
            return NextResponse.json({ message: 'If an account exists with this email, a password reset link has been sent.' });
        }

        // Generate a custom reset token with longer expiry (7 days instead of 1 hour)
        const resetToken = Buffer.from(`${email}:${Date.now()}:${Math.random().toString(36)}`).toString('base64url');
        const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

        // Store token in database for verification
        await supabaseAdmin
            .from('password_reset_tokens')
            .upsert({
                user_id: targetUser.id,
                token: resetToken,
                expires_at: tokenExpiry,
                created_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id'
            });

        // Generate reset URL
        const resetUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

        // If SMTP is configured, send custom email
        if (process.env.EMAIL_SMTP_USER && process.env.EMAIL_SMTP_PASS) {
            try {
                await transporter.sendMail({
                    from: `"PropEase" <${process.env.EMAIL_SMTP_USER}>`,
                    to: email,
                    subject: 'Password Reset Request - PropEase',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                                <h1 style="color: white; margin: 0;">PropEase</h1>
                            </div>
                            <div style="padding: 30px; background: #f8f9fa;">
                                <h2 style="color: #333;">Password Reset Request</h2>
                                <p style="color: #666; line-height: 1.6;">
                                    We received a request to reset your password. Click the button below to set a new password.
                                </p>
                                <p style="color: #666; font-size: 12px;">
                                    This link will expire in <strong>7 days</strong>.
                                </p>
                                <div style="text-align: center; margin: 30px 0;">
                                    <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                        Reset Password
                                    </a>
                                </div>
                                <p style="color: #999; font-size: 12px;">
                                    If you didn't request this, please ignore this email. This link will expire in 7 days.
                                </p>
                            </div>
                        </div>
                    `,
                });
                return NextResponse.json({ message: 'Password reset email sent successfully. Link expires in 7 days.' });
            } catch (emailError) {
                console.error('Email send error:', emailError);
                // Fall back to Supabase email if SMTP fails
            }
        }

        // Fallback: Use Supabase default email (expires in 1 hour)
        const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/auth/callback?next=${encodeURIComponent('/reset-password')}`
        });

        if (error) {
            console.error('Password reset error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ message: 'Password reset email sent successfully' });
    } catch (err: any) {
        console.error('Reset password API error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET: Verify reset token
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const token = searchParams.get('token');

        if (!token) {
            return NextResponse.json({ valid: false, error: 'Token is required' }, { status: 400 });
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        // Check if token exists and is not expired
        const { data: tokenData, error } = await supabaseAdmin
            .from('password_reset_tokens')
            .select('*, user:users(email)')
            .eq('token', token)
            .single();

        if (error || !tokenData) {
            return NextResponse.json({ valid: false, error: 'Invalid token' });
        }

        const isExpired = new Date(tokenData.expires_at) < new Date();
        if (isExpired) {
            return NextResponse.json({ valid: false, error: 'Token has expired' });
        }

        return NextResponse.json({ valid: true, email: tokenData.user?.email });
    } catch (err: any) {
        console.error('Token verification error:', err);
        return NextResponse.json({ valid: false, error: 'Verification failed' }, { status: 500 });
    }
}

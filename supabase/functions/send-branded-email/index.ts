import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string;
  subject: string;
  type: 'signup' | 'reset' | 'welcome';
  token?: string;
  redirectUrl?: string;
}

const getEmailTemplate = (type: string, token?: string, redirectUrl?: string) => {
  const baseStyles = `
    <style>
      .email-container {
        max-width: 600px;
        margin: 0 auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        background: #ffffff;
        padding: 40px 20px;
      }
      .header {
        text-align: center;
        margin-bottom: 40px;
      }
      .logo {
        width: 60px;
        height: 60px;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        border-radius: 12px;
        margin: 0 auto 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 24px;
        font-weight: bold;
      }
      .title {
        color: #1f2937;
        font-size: 24px;
        font-weight: bold;
        margin-bottom: 12px;
      }
      .subtitle {
        color: #6b7280;
        font-size: 16px;
        line-height: 1.5;
      }
      .content {
        background: #f9fafb;
        padding: 30px;
        border-radius: 12px;
        margin: 30px 0;
        text-align: center;
      }
      .button {
        display: inline-block;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        color: white;
        padding: 14px 28px;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 600;
        margin: 20px 0;
      }
      .footer {
        text-align: center;
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid #e5e7eb;
        color: #6b7280;
        font-size: 14px;
      }
      .code {
        background: #f3f4f6;
        padding: 12px 16px;
        border-radius: 6px;
        font-family: 'Courier New', monospace;
        font-size: 18px;
        color: #374151;
        margin: 16px 0;
        border: 1px solid #d1d5db;
      }
    </style>
  `;

  switch (type) {
    case 'signup':
      return `
        ${baseStyles}
        <div class="email-container">
          <div class="header">
            <div class="logo">SJ</div>
            <h1 class="title">Welcome to SurveyJumper!</h1>
            <p class="subtitle">Thank you for joining our platform. Please verify your email to get started.</p>
          </div>
          
          <div class="content">
            <p style="margin-bottom: 20px; color: #374151;">Click the button below to verify your email address:</p>
            <a href="${redirectUrl}" class="button">Verify Email Address</a>
            <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <span style="word-break: break-all;">${redirectUrl}</span>
            </p>
          </div>
          
          <div class="footer">
            <p>SurveyJumper - AI-Powered Employee Feedback Analysis</p>
            <p style="margin-top: 8px;">If you didn't create an account, you can safely ignore this email.</p>
          </div>
        </div>
      `;
    
    case 'reset':
      return `
        ${baseStyles}
        <div class="email-container">
          <div class="header">
            <div class="logo">SJ</div>
            <h1 class="title">Reset Your Password</h1>
            <p class="subtitle">We received a request to reset your password for your SurveyJumper account.</p>
          </div>
          
          <div class="content">
            <p style="margin-bottom: 20px; color: #374151;">Click the button below to reset your password:</p>
            <a href="${redirectUrl}" class="button">Reset Password</a>
            <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">
              This link will expire in 1 hour for security reasons.
            </p>
            <p style="margin-top: 12px; color: #6b7280; font-size: 14px;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <span style="word-break: break-all;">${redirectUrl}</span>
            </p>
          </div>
          
          <div class="footer">
            <p>SurveyJumper - AI-Powered Employee Feedback Analysis</p>
            <p style="margin-top: 8px;">If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
        </div>
      `;
    
    default:
      return `
        ${baseStyles}
        <div class="email-container">
          <div class="header">
            <div class="logo">SJ</div>
            <h1 class="title">Hello from SurveyJumper!</h1>
            <p class="subtitle">Thank you for using our AI-powered employee feedback platform.</p>
          </div>
          
          <div class="footer">
            <p>SurveyJumper - AI-Powered Employee Feedback Analysis</p>
          </div>
        </div>
      `;
  }
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, subject, type, token, redirectUrl }: EmailRequest = await req.json();

    const html = getEmailTemplate(type, token, redirectUrl);

    const emailResponse = await resend.emails.send({
      from: "SurveyJumper <noreply@surveyjumper.com>",
      to: [to],
      subject: subject,
      html: html,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-branded-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
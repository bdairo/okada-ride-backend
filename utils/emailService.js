// In a real application, this would use a proper email service like SendGrid, Mailgun, etc.
// For now, we'll just log the email to the console

/**
 * Send a verification email to a patient
 * @param {string} email - The patient's email address
 * @param {string} code - The verification code
 * @param {string} facilityName - The name of the facility
 * @param {string} patientName - The patient's first name
 * @returns {Promise<void>}
 */
export const sendVerificationEmail = async (email, code, facilityName, patientName) => {
    // In a real application, this would send an actual email
    console.log(`
    =============== VERIFICATION EMAIL ===============
    To: ${email}
    Subject: Verification Code for ${facilityName}
    
    Hello ${patientName},
    
    ${facilityName} is requesting to add you as a patient to their facility in the Okada Ride system.
    
    Your verification code is: ${code}
    
    This code will expire in 30 minutes.
    
    If you did not request this, please ignore this email.
    
    Thank you,
    The Okada Ride Team
    ===================================================
    `);
    
    // Return a resolved promise to simulate sending an email
    return Promise.resolve();
}; 
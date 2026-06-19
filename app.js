// 1. Initialize Supabase Client
const SUPABASE_URL = 'https://dbdbmbtveftcxcnmqobs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiZGJtYnR2ZWZ0Y3hjbm1xb2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3OTg0OTUsImV4cCI6MjA5NTM3NDQ5NX0.k9EugAVx97AlWFpPdy5xNqsqA7WrhamHZVIs-Rqt3J0';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. SHA-256 Hashing Utility
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 3. Login Event Listener
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const loginBtn = document.getElementById('loginBtn');
    const errorMsg = document.getElementById('errorMessage');
    
    const usernameInput = document.getElementById('username').value;
    const passwordInput = document.getElementById('password').value;

    // Reset UI state
    loginBtn.textContent = 'Authenticating...';
    loginBtn.disabled = true;
    errorMsg.classList.add('hidden');

    try {
        // TEMPORARILY DISABLED HASHING to match plain text in database
        // const hashedPassword = await hashPassword(passwordInput);

        console.log("Attempting secure login RPC...");

        // Call the secure SQL function we created
        const { data, error } = await supabaseClient.rpc('authenticate_user', {
            p_username: usernameInput,
            p_password_hash: passwordInput // <-- Sending the plain text directly
        });

        if (error) {
            console.error("RPC Error:", error.message);
            throw error;
        }

        console.log("Login Success! Payload:", data);

        // Login successful: Save secure session data to local storage
        const userPayload = {
            user_id: data.user_id,
            username: data.username,
            company_line: data.company_line,
            role: data.role,
            expires: new Date().getTime() + (8 * 60 * 60 * 1000) // 8 Hour Expiry
        };
        
        localStorage.setItem('target_session', JSON.stringify(userPayload));

        // Redirect based on role
        if (data.role === 'admin') {
            window.location.href = 'admin.html';
        } else {
            window.location.href = 'manager.html';
        }

    } catch (err) {
        console.error('CRITICAL ERROR:', err.message);
        errorMsg.classList.remove('hidden');
        loginBtn.textContent = 'Sign In';
        loginBtn.disabled = false;
    }
});
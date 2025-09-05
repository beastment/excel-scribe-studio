// Fixed test script for Thematic Analysis Edge Function
// Project: abobvpamaiwrgwtghoyh.supabase.co

async function testThematicAnalysisFixed() {
  console.log("🔍 Testing Thematic Analysis Function with Correct Project Details");
  
  const SUPABASE_URL = "https://abobvpamaiwrgwtghoyh.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFib2J2cGFtYWl3cmd3dGdob3loIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NTA5NDAsImV4cCI6MjA3MDAyNjk0MH0.4EnP4lkkvhYySkkAK80dc4dmqoHrBvfm6Ql0hzdtdy0";
  
  // Test data
  const testData = {
    comments: [
      {
        id: "test-1",
        text: "Great work environment but need better communication between departments",
        department: "Engineering",
        gender: "Male",
        age: "30-40"
      },
      {
        id: "test-2", 
        text: "Management doesn't listen to our feedback and the workload is too heavy",
        department: "HR",
        gender: "Female", 
        age: "25-35"
      },
      {
        id: "test-3",
        text: "Love the team culture and flexible working hours",
        department: "Marketing",
        gender: "Female",
        age: "25-35"
      }
    ],
    userId: "034920cf-a2bc-4973-b835-689304aa271d" // Real user ID from database
  };

  try {
    console.log("🚀 Sending request to thematic-analysis function...");
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/thematic-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, // Using anon key for testing
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify(testData)
    });

    console.log(`📊 Response Status: ${response.status}`);
    console.log(`📋 Response Headers:`, Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log(`📝 Response Body:`, responseText);

    if (response.ok) {
      console.log("✅ SUCCESS! Function is working correctly");
      try {
        const data = JSON.parse(responseText);
        console.log("📊 Parsed Response:", data);
      } catch (e) {
        console.log("⚠️ Response is not JSON:", responseText);
      }
    } else {
      console.log("❌ FAILED! Function returned error");
      console.log("🔍 Error Details:", responseText);
      
      // Provide specific error guidance
      if (response.status === 401) {
        console.log("💡 SOLUTION: Authentication issue - check JWT token");
      } else if (response.status === 402) {
        console.log("💡 SOLUTION: Insufficient credits - check user credits");
      } else if (response.status === 500) {
        console.log("💡 SOLUTION: Server error - check environment variables and AI configuration");
      }
    }
  } catch (error) {
    console.error("❌ Network Error:", error.message);
    console.log("💡 SOLUTION: Check network connection and function URL");
  }
}

// Health check function
async function testHealthCheck() {
  console.log("🏥 Testing Health Check Endpoint...");
  
  const SUPABASE_URL = "https://abobvpamaiwrgwtghoyh.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFib2J2cGFtYWl3cmd3dGdob3loIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0NTA5NDAsImV4cCI6MjA3MDAyNjk0MH0.4EnP4lkkvhYySkkAK80dc4dmqoHrBvfm6Ql0hzdtdy0";

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/thematic-analysis`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      }
    });

    console.log(`📊 Health Check Status: ${response.status}`);
    const responseText = await response.text();
    console.log(`📝 Health Check Response:`, responseText);

    if (response.ok) {
      console.log("✅ Health Check PASSED - Function is accessible");
    } else {
      console.log("❌ Health Check FAILED - Function has issues");
    }
  } catch (error) {
    console.error("❌ Health Check Error:", error.message);
  }
}

// Export functions
window.testThematicAnalysisFixed = testThematicAnalysisFixed;
window.testHealthCheck = testHealthCheck;

console.log("🚀 Thematic Analysis Test Script Loaded");
console.log("📋 Available functions:");
console.log("  - testHealthCheck() - Test if function is accessible");
console.log("  - testThematicAnalysisFixed() - Test full function with real data");
console.log("");
console.log("🔧 Project Details:");
console.log("  - URL: https://abobvpamaiwrgwtghoyh.supabase.co");
console.log("  - Project ID: abobvpamaiwrgwtghoyh");
console.log("  - User ID: 034920cf-a2bc-4973-b835-689304aa271d");
console.log("");
console.log("💡 Run: testHealthCheck() first, then testThematicAnalysisFixed()");

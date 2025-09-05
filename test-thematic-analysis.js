/**
 * Test script for the Thematic Analysis Edge Function
 * Run this in your browser console or as a Node.js script to test the function
 */

// Test data
const testComments = [
  {
    id: "comment-1",
    text: "Great work environment, but need better communication between departments",
    department: "Engineering",
    gender: "Female",
    age: "25-34"
  },
  {
    id: "comment-2", 
    text: "Management doesn't listen to our feedback and the workload is too heavy",
    department: "Marketing",
    gender: "Male", 
    age: "35-44"
  },
  {
    id: "comment-3",
    text: "Love the team culture and flexible working hours",
    department: "Engineering",
    gender: "Female",
    age: "25-34"
  },
  {
    id: "comment-4",
    text: "Salary is competitive but career growth opportunities are limited",
    department: "Sales",
    gender: "Male",
    age: "35-44"
  },
  {
    id: "comment-5",
    text: "The office space is outdated and we need better equipment",
    department: "Marketing",
    gender: "Female",
    age: "25-34"
  }
];

// Test function
async function testThematicAnalysis() {
  try {
    console.log("🧪 Testing Thematic Analysis Edge Function...");
    
    // First, test the health check endpoint
    console.log("1️⃣ Testing health check...");
    const healthResponse = await fetch('/functions/v1/thematic-analysis', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log("✅ Health check passed:", healthData);
    } else {
      console.error("❌ Health check failed:", healthResponse.status, healthResponse.statusText);
      return;
    }
    
    // Get the current user's auth token (you'll need to replace this with actual token)
    const authToken = "YOUR_AUTH_TOKEN_HERE"; // Replace with actual token
    
    if (authToken === "YOUR_AUTH_TOKEN_HERE") {
      console.log("⚠️ Please replace 'YOUR_AUTH_TOKEN_HERE' with your actual auth token");
      console.log("You can get this from your browser's localStorage or Supabase auth");
      return;
    }
    
    // Test the actual analysis
    console.log("2️⃣ Testing thematic analysis...");
    const analysisResponse = await fetch('/functions/v1/thematic-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        comments: testComments,
        userId: "test-user-id" // This will be overridden by the auth token
      })
    });
    
    if (analysisResponse.ok) {
      const analysisData = await analysisResponse.json();
      console.log("✅ Analysis successful:", analysisData);
    } else {
      const errorData = await analysisResponse.json();
      console.error("❌ Analysis failed:", analysisResponse.status, errorData);
    }
    
  } catch (error) {
    console.error("❌ Test failed with error:", error);
  }
}

// Instructions
console.log(`
🔧 Thematic Analysis Edge Function Test Script

To use this script:

1. Open your browser's developer console
2. Copy and paste this entire script
3. Replace 'YOUR_AUTH_TOKEN_HERE' with your actual auth token
4. Run: testThematicAnalysis()

To get your auth token:
- Open browser dev tools → Application → Local Storage
- Look for Supabase auth token or session data
- Or check the Network tab when making authenticated requests

Common issues to check:
- Is the Edge Function deployed?
- Are environment variables set (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)?
- Are AI API keys configured (OPENAI_API_KEY or AZURE_OPENAI_API_KEY)?
- Does the user have sufficient credits?
`);

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testThematicAnalysis, testComments };
}

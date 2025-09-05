// Debug script for Thematic Analysis Edge Function
// Run this in your browser's developer console

async function debugThematicAnalysis() {
  console.log("🔍 Starting Thematic Analysis Debug...");
  
  // Step 1: Test health endpoint
  console.log("\n1️⃣ Testing health endpoint...");
  try {
    const healthResponse = await fetch('https://your-project.supabase.co/functions/v1/thematic-analysis', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const healthData = await healthResponse.json();
    console.log("Health check status:", healthResponse.status);
    console.log("Health check response:", healthData);
    
    if (healthResponse.ok) {
      console.log("✅ Function is running and accessible");
    } else {
      console.log("❌ Function health check failed");
      return;
    }
  } catch (error) {
    console.error("❌ Health check failed:", error);
    return;
  }
  
  // Step 2: Test with minimal data
  console.log("\n2️⃣ Testing with minimal data...");
  const testData = {
    comments: [
      {
        id: "test-1",
        text: "Great work environment but need better communication",
        department: "Engineering"
      }
    ],
    userId: "test-user-id" // Replace with actual user ID
  };
  
  try {
    const response = await fetch('https://your-project.supabase.co/functions/v1/thematic-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`, // Get from localStorage
        'apikey': 'your-supabase-anon-key' // Replace with your anon key
      },
      body: JSON.stringify(testData)
    });
    
    console.log("Response status:", response.status);
    console.log("Response headers:", Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log("Response body:", responseText);
    
    if (response.ok) {
      console.log("✅ Function call successful");
      try {
        const data = JSON.parse(responseText);
        console.log("Parsed response:", data);
      } catch (e) {
        console.log("Response is not JSON:", responseText);
      }
    } else {
      console.log("❌ Function call failed");
      console.log("Error details:", responseText);
    }
  } catch (error) {
    console.error("❌ Function call error:", error);
  }
  
  // Step 3: Check authentication
  console.log("\n3️⃣ Checking authentication...");
  const authToken = localStorage.getItem('supabase.auth.token');
  if (authToken) {
    console.log("✅ Auth token found:", authToken.substring(0, 20) + "...");
  } else {
    console.log("❌ No auth token found in localStorage");
    console.log("Available localStorage keys:", Object.keys(localStorage));
  }
  
  // Step 4: Test with different data formats
  console.log("\n4️⃣ Testing different data formats...");
  
  const testCases = [
    {
      name: "Minimal comment",
      data: {
        comments: [{ id: "1", text: "Test comment" }],
        userId: "test-user"
      }
    },
    {
      name: "Comment with demographics",
      data: {
        comments: [
          {
            id: "1",
            text: "Great team culture",
            department: "Engineering",
            gender: "Male",
            age: "30-40"
          }
        ],
        userId: "test-user"
      }
    },
    {
      name: "Multiple comments",
      data: {
        comments: [
          { id: "1", text: "Good work environment" },
          { id: "2", text: "Need better communication" },
          { id: "3", text: "Salary is competitive" }
        ],
        userId: "test-user"
      }
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\nTesting: ${testCase.name}`);
    try {
      const response = await fetch('https://your-project.supabase.co/functions/v1/thematic-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'apikey': 'your-supabase-anon-key'
        },
        body: JSON.stringify(testCase.data)
      });
      
      console.log(`Status: ${response.status}`);
      const responseText = await response.text();
      console.log(`Response: ${responseText.substring(0, 200)}...`);
      
      if (response.ok) {
        console.log("✅ Success");
      } else {
        console.log("❌ Failed");
      }
    } catch (error) {
      console.error("❌ Error:", error.message);
    }
  }
  
  console.log("\n🏁 Debug complete!");
}

// Helper function to get Supabase URL and keys from the page
function getSupabaseConfig() {
  // Try to find Supabase config in the page
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    if (script.textContent.includes('supabase')) {
      console.log("Found Supabase config in script:", script.textContent.substring(0, 200));
    }
  }
  
  // Check for common Supabase variable names
  if (window.supabase) {
    console.log("Supabase client found:", window.supabase);
  }
  
  // Check localStorage for Supabase data
  const supabaseKeys = Object.keys(localStorage).filter(key => 
    key.includes('supabase') || key.includes('sb-')
  );
  console.log("Supabase-related localStorage keys:", supabaseKeys);
}

// Run the debug
console.log("🚀 Thematic Analysis Debug Script");
console.log("📝 Instructions:");
console.log("1. Replace 'your-project.supabase.co' with your actual Supabase URL");
console.log("2. Replace 'your-supabase-anon-key' with your actual anon key");
console.log("3. Replace 'test-user-id' with a real user ID from your database");
console.log("4. Run: debugThematicAnalysis()");
console.log("5. Or run: getSupabaseConfig() to find your config");

// Export functions for manual use
window.debugThematicAnalysis = debugThematicAnalysis;
window.getSupabaseConfig = getSupabaseConfig;

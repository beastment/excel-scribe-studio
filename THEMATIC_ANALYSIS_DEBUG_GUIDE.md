# 🔍 Thematic Analysis Edge Function Debug Guide

## 🚨 Current Issue: "Edge Function returned a non-2xx status code"

This error means the function is running but encountering an error during execution. Here's how to debug it systematically.

## 🛠️ Step-by-Step Debugging Process

### 1️⃣ **Check Function Status**

First, verify the function is deployed and accessible:

```bash
# Check if function exists
supabase functions list

# Check function logs (most important!)
supabase functions logs thematic-analysis --limit 20

# Test health endpoint
curl -X GET https://your-project.supabase.co/functions/v1/thematic-analysis
```

### 2️⃣ **Use the Debug Script**

I've created a comprehensive debug script. Here's how to use it:

1. **Open your browser's developer console** (F12)
2. **Copy and paste the contents of `debug-thematic-analysis.js`**
3. **Update the placeholders**:
   - Replace `your-project.supabase.co` with your actual Supabase URL
   - Replace `your-supabase-anon-key` with your actual anon key
   - Replace `test-user-id` with a real user ID
4. **Run the debug**: `debugThematicAnalysis()`

### 3️⃣ **Check Common Error Scenarios**

Based on the enhanced error handling, here are the most likely issues:

#### 🔴 **Status 400 - Bad Request**
```json
{
  "success": false,
  "error": "Invalid JSON in request body"
}
```
**Solution**: Check the request format in browser dev tools

#### 🔴 **Status 401 - Authentication Failed**
```json
{
  "success": false,
  "error": "Authentication failed"
}
```
**Solution**: Verify user is logged in and token is valid

#### 🔴 **Status 402 - Insufficient Credits**
```json
{
  "success": false,
  "error": "Insufficient credits"
}
```
**Solution**: Check user_credits table or add credits

#### 🔴 **Status 500 - Server Error**
```json
{
  "success": false,
  "error": "Missing Supabase environment variables"
}
```
**Solution**: Check environment variables

### 4️⃣ **Environment Variables Check**

Verify these are set in your Supabase project:

```bash
# Check secrets
supabase secrets list

# Required secrets:
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY
# - OPENAI_API_KEY (or AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT)
```

### 5️⃣ **Database Checks**

Run these SQL queries in your Supabase dashboard:

```sql
-- Check user credits
SELECT * FROM user_credits WHERE user_id = 'your-user-id';

-- Check AI configurations
SELECT * FROM ai_configurations WHERE scanner_type IN ('scan_a', 'thematic-analysis');

-- Check if user exists
SELECT * FROM profiles WHERE user_id = 'your-user-id';

-- Check recent AI logs
SELECT * FROM ai_logs ORDER BY created_at DESC LIMIT 10;
```

### 6️⃣ **Manual Testing**

Use this curl command to test the function directly:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/thematic-analysis \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -d '{
    "comments": [
      {
        "id": "test-1",
        "text": "Great work environment but need better communication",
        "department": "Engineering"
      }
    ],
    "userId": "test-user"
  }'
```

### 7️⃣ **Browser Debugging**

Open your browser's developer tools and check:

1. **Network Tab**: Look for the failed request
2. **Console Tab**: Check for any JavaScript errors
3. **Application Tab**: Verify auth tokens are present

### 8️⃣ **Quick Fixes**

1. **Redeploy the function**:
   ```bash
   supabase functions deploy thematic-analysis
   ```

2. **Check the function URL**: Make sure you're using the correct project URL

3. **Test with minimal data**: Use just 1-2 comments for testing

## 🔍 **Enhanced Error Messages**

The updated function now provides detailed error messages. Look for these in the logs:

- `[ERROR] Failed to parse request body` - JSON parsing issue
- `[ERROR] Missing Supabase environment variables` - Config issue
- `[ERROR] Authentication failed` - Auth issue
- `[ERROR] Insufficient credits` - Credit issue
- `[AI ERROR] Failed to call AI` - AI API issue
- `[PARSE ERROR] Failed to parse AI response` - AI response issue

## 🎯 **Most Likely Issues**

Based on common patterns, the most likely causes are:

1. **Missing AI Configuration** - The function can't find a configuration for `thematic-analysis` or `scan_a`
2. **Missing Environment Variables** - `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` not set
3. **AI API Issues** - `OPENAI_API_KEY` missing or invalid
4. **User Credits** - User doesn't have sufficient credits

## 🚀 **Next Steps**

1. **Run the debug script** in your browser console
2. **Check the logs** using `supabase functions logs thematic-analysis`
3. **Verify environment variables** are set
4. **Check user credits** in the database
5. **Test with minimal data** to isolate the issue

## 📞 **Getting Help**

If you're still stuck, please share:

1. **The exact error message** from the logs
2. **The response body** from the failed request
3. **Your environment variables** (without sensitive values)
4. **The debug script output**

This will help identify the specific issue and provide a targeted solution.

## 🔧 **Function Health Check**

The function now includes a health check endpoint. Test it with:

```bash
curl -X GET https://your-project.supabase.co/functions/v1/thematic-analysis
```

Expected response:
```json
{
  "success": true,
  "message": "Thematic Analysis function is running",
  "timestamp": "2024-01-XX...",
  "runId": "thematic-XXXX"
}
```

If this fails, the function isn't deployed properly. If it succeeds, the issue is in the POST request handling.

import { CommentData } from "@/components/FileUpload";

/**
 * Generates demo comment data with realistic employee survey responses
 * @param count - Number of comments to generate
 * @returns Array of CommentData objects
 */
export function generateDemoComments(count: number): CommentData[] {
  const departments = [
    "Engineering", "Marketing", "Finance", "HR", "Operations", 
    "Sales", "Management", "Security", "Manufacturing", "IT",
    "Customer Service", "Legal", "Research & Development", "Quality Assurance"
  ];

  const positiveComments = [
    "I love working here! The flexible schedule and remote work options have been life-changing.",
    "Great company culture and benefits package. The health insurance coverage is excellent.",
    "The training programs have been very helpful for my professional development.",
    "I enjoy the collaborative work environment and my team members are supportive.",
    "I love the company picnic every summer! It's a great way to connect with colleagues.",
    "The work-life balance here is excellent. I appreciate the mental health days.",
    "The company's commitment to sustainability is impressive and motivating.",
    "The IT department is very responsive when we have technical issues.",
    "Management really listens to employee feedback and takes action.",
    "The office environment is clean, modern, and conducive to productivity.",
    "I appreciate the professional development opportunities and tuition reimbursement.",
    "The team collaboration tools and technology stack are top-notch.",
    "The company values diversity and inclusion, which makes me proud to work here.",
    "The annual bonus structure is fair and motivating.",
    "I feel valued and recognized for my contributions to the team."
  ];

  const neutralComments = [
    "The office coffee machine is always broken. Can we please get it fixed?",
    "The new parking policy is unfair to employees who don't live close to the office.",
    "Please provide more opportunities for career advancement and promotion.",
    "Can we please get better chairs? My back is killing me after long days at the computer.",
    "The cafeteria food could be improved with more healthy options.",
    "The meeting rooms are often double-booked, causing scheduling conflicts.",
    "The printer on the third floor is constantly out of paper.",
    "The air conditioning in the office is either too hot or too cold.",
    "The elevator maintenance schedule seems to conflict with peak usage times.",
    "The office WiFi could be more reliable in certain areas of the building.",
    "The parking lot lighting could be improved for evening shifts.",
    "The break room refrigerator needs to be cleaned more frequently.",
    "The office supplies ordering process could be streamlined.",
    "The conference call system has frequent technical difficulties.",
    "The office layout could be optimized for better collaboration."
  ];

  const concerningComments = [
    "The management team really needs to improve their communication skills. John Smith in HR is particularly difficult to work with.",
    "The new manager in accounting, Sarah Johnson (employee ID 12345), has been making inappropriate comments about female employees. This needs to be addressed immediately.",
    "I feel unsafe coming to work due to threats from my supervisor Mike Wilson. He said he would \"make my life hell\" if I didn't work overtime without pay.",
    "My direct report told me about drug use during work hours by employees in the warehouse. I witnessed Tom Anderson (badge #789) smoking what appeared to be marijuana during lunch break.",
    "There have been multiple incidents of theft from employee lockers. Security cameras caught Jennifer Lee from customer service taking items from other people's belongings.",
    "There are serious safety violations in the manufacturing area. Equipment operator David Chen (SSN: 123-45-6789) doesn't follow proper procedures and someone is going to get hurt.",
    "I've witnessed discrimination against older employees. Manager Lisa Rodriguez (phone: 555-0123) made ageist comments saying \"we need fresh blood, not these old dinosaurs\".",
    "The annual performance review process needs improvement. My manager Rebecca Williams provides very little useful feedback.",
    "There's a toxic work environment in the sales department. Team lead Michael Brown (email: mbrown@company.com) bullies junior staff members regularly.",
    "I've reported harassment by my colleague Amanda Davis (extension 4567) multiple times but HR hasn't taken any action.",
    "The workload distribution is unfair. Senior analyst Robert Taylor (badge #1234) consistently gets easier assignments while others are overloaded.",
    "There's favoritism in promotions. Assistant manager Jessica White (office 205) gets preferential treatment despite poor performance.",
    "The safety equipment in the warehouse is outdated and potentially dangerous. Supervisor Kevin Martinez (ID: KM001) ignores safety protocols.",
    "I've observed inappropriate behavior by department head Patricia Anderson (phone: 555-9876) during company events.",
    "The company's handling of the recent layoffs was insensitive and poorly communicated by executive team member Daniel Kim (office 301)."
  ];

  const identifiableComments = [
    "The management team really needs to improve their communication skills. John Smith in HR is particularly difficult to work with.",
    "The new manager in accounting, Sarah Johnson (employee ID 12345), has been making inappropriate comments about female employees. This needs to be addressed immediately.",
    "I feel unsafe coming to work due to threats from my supervisor Mike Wilson. He said he would \"make my life hell\" if I didn't work overtime without pay.",
    "My direct report told me about drug use during work hours by employees in the warehouse. I witnessed Tom Anderson (badge #789) smoking what appeared to be marijuana during lunch break.",
    "There have been multiple incidents of theft from employee lockers. Security cameras caught Jennifer Lee from customer service taking items from other people's belongings.",
    "There are serious safety violations in the manufacturing area. Equipment operator David Chen (SSN: 123-45-6789) doesn't follow proper procedures and someone is going to get hurt.",
    "I've witnessed discrimination against older employees. Manager Lisa Rodriguez (phone: 555-0123) made ageist comments saying \"we need fresh blood, not these old dinosaurs\".",
    "The annual performance review process needs improvement. My manager Rebecca Williams provides very little useful feedback.",
    "There's a toxic work environment in the sales department. Team lead Michael Brown (email: mbrown@company.com) bullies junior staff members regularly.",
    "I've reported harassment by my colleague Amanda Davis (extension 4567) multiple times but HR hasn't taken any action.",
    "The workload distribution is unfair. Senior analyst Robert Taylor (badge #1234) consistently gets easier assignments while others are overloaded.",
    "There's favoritism in promotions. Assistant manager Jessica White (office 205) gets preferential treatment despite poor performance.",
    "The safety equipment in the warehouse is outdated and potentially dangerous. Supervisor Kevin Martinez (ID: KM001) ignores safety protocols.",
    "I've observed inappropriate behavior by department head Patricia Anderson (phone: 555-9876) during company events.",
    "The company's handling of the recent layoffs was insensitive and poorly communicated by executive team member Daniel Kim (office 301)."
  ];

  const comments: CommentData[] = [];
  
  for (let i = 0; i < count; i++) {
    const rowNumber = i + 1;
    const department = departments[Math.floor(Math.random() * departments.length)];
    
    // Determine comment type based on index to ensure variety
    let commentText: string;
    let concerning = false;
    let identifiable = false;
    
    if (i % 10 === 0) {
      // Every 10th comment is concerning and identifiable
      commentText = concerningComments[Math.floor(Math.random() * concerningComments.length)];
      concerning = true;
      identifiable = true;
    } else if (i % 7 === 0) {
      // Every 7th comment is only concerning
      commentText = concerningComments[Math.floor(Math.random() * concerningComments.length)];
      concerning = true;
    } else if (i % 5 === 0) {
      // Every 5th comment is only identifiable
      commentText = identifiableComments[Math.floor(Math.random() * identifiableComments.length)];
      identifiable = true;
    } else if (i % 3 === 0) {
      // Every 3rd comment is neutral
      commentText = neutralComments[Math.floor(Math.random() * neutralComments.length)];
    } else {
      // Rest are positive
      commentText = positiveComments[Math.floor(Math.random() * positiveComments.length)];
    }
    
    comments.push({
      id: `demo_${rowNumber}`,
      originalText: commentText,
      text: commentText,
      author: "Anonymous",
      originalRow: rowNumber,
      timestamp: new Date().toISOString(),
      checked: false,
      concerning: concerning,
      identifiable: identifiable,
      demographics: department
    });
  }
  
  return comments;
}

/**
 * Generates demo comments for the small demo (100 comments)
 */
export function generateSmallDemoComments(): CommentData[] {
  return generateDemoComments(100);
}

/**
 * Generates demo comments for the medium demo (200 comments)
 */
export function generateMediumDemoComments(): CommentData[] {
  return generateDemoComments(200);
}

/**
 * Generates demo comments for the large demo (500 comments)
 */
export function generateLargeDemoComments(): CommentData[] {
  return generateDemoComments(500);
}

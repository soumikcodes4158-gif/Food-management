import jsPDF from "jspdf";

function money(value) {
  return `Rs.${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(dateString) {
  if (!dateString) return "-";

  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function getTeacher(record, users) {
  if (!record) return null;

  return (
    users.find(user => user.id === record.teacherId) ||
    users.find(user => user.username === record.teacherUsername) ||
    users.find(
      user =>
        user.className === record.className &&
        user.section === record.section
    ) ||
    null
  );
}

function getTotalStudents(record, users) {
  if (
    record &&
    record.totalStudents !== undefined &&
    record.totalStudents !== null
  ) {
    return safeNumber(record.totalStudents);
  }

  const teacher = getTeacher(record, users);

  if (teacher && teacher.totalStudents !== undefined) {
    return safeNumber(teacher.totalStudents);
  }

  return 0;
}

function getVegPresent(record) {
  return safeNumber(record?.vegPresent);
}

function getNonVegPresent(record) {
  return safeNumber(record?.nonVegPresent);
}

function calculateFoodAmount(record, food) {
  if (!record || !food) return 0;

  const students =
    food.category === "Veg"
      ? getVegPresent(record)
      : getNonVegPresent(record);

  return students * safeNumber(food.rate);
}

function calculateDefaultRecordExpenditure(record, foodItems) {
  return foodItems.reduce(
    (total, food) => total + calculateFoodAmount(record, food),
    0
  );
}

function buildFoodSummary(records, foodItems) {
  return foodItems.map(food => {
    const students = records.reduce((total, record) => {
      const count =
        food.category === "Veg"
          ? getVegPresent(record)
          : getNonVegPresent(record);

      return total + count;
    }, 0);

    const rate = safeNumber(food.rate);

    return {
      name: food.name || "Food",
      category: food.category || "-",
      students,
      rate,
      amount: students * rate
    };
  });
}

function drawInvoiceHeader(doc, {
  schoolName,
  invoiceNumber,
  invoiceDate,
  phone,
  email,
  address
}) {
  const pageWidth = doc.internal.pageSize.getWidth();

  const left = 18;
  const right = pageWidth - 18;

  doc.setTextColor(45, 45, 45);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);

  doc.text("SSFMS - SMART", left, 18);
  doc.text("SCHOOL FOOD", left, 24);
  doc.text("MANAGEMENT", left, 30);
  doc.text("SYSTEM", left, 36);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("INVOICE", right, 18, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);

  doc.text(address || "123 ANYWHERE ST., ANY CITY", right, 25, {
    align: "right"
  });

  doc.text(phone || "123-456-7890", right, 30, {
    align: "right"
  });

  doc.text(email || "WWW.REALLYGREATSITE.COM", right, 35, {
    align: "right"
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(45, 45, 45);

  doc.text(schoolName || "MY SCHOOL", left, 52);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);

  doc.text(phone || "(12) 3456-7890", left, 59);
  doc.text(email || "hello@reallygreatsite.com", left, 64);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);

  doc.text(invoiceNumber || "2026-FE-01", right, 52, {
    align: "right"
  });

  doc.text(formatDate(invoiceDate), right, 59, {
    align: "right"
  });
}

function drawInvoiceItems(doc, {
  schoolName,
  className,
  section,
  totalStudents,
  foodSummary
}) {
  const pageWidth = doc.internal.pageSize.getWidth();

  const left = 18;
  const right = pageWidth - 18;

  let y = 82;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 70);

  doc.text("ITEM", left, y);
  doc.text("AMOUNT", right, y, { align: "right" });

  doc.setDrawColor(65, 95, 95);
  doc.setLineWidth(0.8);
  doc.line(left, y + 5, right, y + 5);

  y += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(65, 85, 85);

  doc.text(
    `Food Expenditure for`,
    left,
    y
  );

  doc.text(
    `${totalStudents} Students`,
    78,
    y
  );

  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(85, 85, 85);

  doc.text(
    `Class ${className || "-"}`,
    left,
    y
  );

  doc.text(
    `Detailed report of food`,
    left,
    y + 5
  );

  doc.text(
    `expenditure for students`,
    left,
    y + 10
  );

  doc.text(
    `in Class ${className || "-"}, Section ${section || "-"}.`,
    left,
    y + 15
  );

  y += 38;

  foodSummary.forEach(food => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(65, 85, 85);

    doc.text(food.name, left, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(85, 85, 85);

    doc.text(
      `Served to ${food.students} ${food.category.toLowerCase()} students`,
      left,
      y + 6
    );

    doc.text(
      `at ${money(food.rate)} each.`,
      left,
      y + 11
    );

    doc.text(
      `${food.students}`,
      78,
      y
    );

    doc.text(
      money(food.rate),
      112,
      y
    );

    doc.setFont("helvetica", "bold");
    doc.setSize = 8;
    doc.text(
      money(food.amount),
      right,
      y,
      { align: "right" }
    );

    y += 30;
  });

  return y;
}

function drawInvoiceTotal(doc, totalAmount) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const left = 18;
  const right = pageWidth - 18;

  const lineY = pageHeight - 48;

  doc.setDrawColor(65, 95, 95);
  doc.setLineWidth(0.8);

  doc.line(left, lineY, right, lineY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(55, 75, 75);

  doc.text(
    "TOTAL EXPENDITURE",
    left,
    lineY + 10
  );

  doc.setFontSize(11);

  doc.text(
    money(totalAmount),
    right,
    lineY + 10,
    { align: "right" }
  );

  doc.line(
    left,
    lineY + 17,
    right,
    lineY + 17
  );
}

function drawSignatures(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const y = pageHeight - 25;

  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);

  doc.line(18, y, 65, y);
  doc.line(pageWidth - 65, y, pageWidth - 18, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(90, 90, 90);

  doc.text(
    "Prepared By",
    41.5,
    y + 5,
    { align: "center" }
  );

  doc.text(
    "Authorized Signature",
    pageWidth - 41.5,
    y + 5,
    { align: "center" }
  );
}

export function generateFoodExpenditureInvoice({
  schoolName = "MY SCHOOL",
  invoiceNumber = "2026-FE-01",
  invoiceDate,
  phone = "(12) 3456-7890",
  email = "hello@reallygreatsite.com",
  address = "123 ANYWHERE ST., ANY CITY",
  period = "daily",
  filteredRecords = [],
  foodItems = [],
  users = [],
  calculateRecordExpenditure
}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const calculateRecordTotal = record => {
    if (typeof calculateRecordExpenditure === "function") {
      return safeNumber(
        calculateRecordExpenditure(record, foodItems)
      );
    }

    return calculateDefaultRecordExpenditure(
      record,
      foodItems
    );
  };

  const totalStudents = filteredRecords.reduce(
    (total, record) =>
      total + getTotalStudents(record, users),
    0
  );

  const classes = [
    ...new Set(
      filteredRecords
        .map(record => record.className)
        .filter(Boolean)
    )
  ];

  const sections = [
    ...new Set(
      filteredRecords
        .map(record => record.section)
        .filter(Boolean)
    )
  ];

  const className =
    classes.length === 1 ? classes[0] : "-";

  const section =
    sections.length === 1 ? sections[0] : "-";

  const foodSummary = buildFoodSummary(
    filteredRecords,
    foodItems
  );

  const totalExpenditure =
    filteredRecords.reduce(
      (sum, record) =>
        sum + calculateRecordTotal(record),
      0
    );

  drawInvoiceHeader(doc, {
    schoolName,
    invoiceNumber,
    invoiceDate,
    phone,
    email,
    address
  });

  drawInvoiceItems(doc, {
    schoolName,
    className,
    section,
    totalStudents,
    foodSummary
  });

  drawInvoiceTotal(
    doc,
    totalExpenditure
  );

  drawSignatures(doc);

  const cleanSchoolName = String(
    schoolName || "School"
  )
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");

  const fileName =
    `SSFMS_${cleanSchoolName}_Food_Invoice_${invoiceNumber}.pdf`;

  return {
    doc,
    fileName
  };
}

export function downloadFoodExpenditureInvoice(options) {
  const { doc, fileName } =
    generateFoodExpenditureInvoice(options);

  doc.save(fileName);
}

export function previewFoodExpenditureInvoice(options) {
  const { doc } =
    generateFoodExpenditureInvoice(options);

  const pdfBlob = doc.output("blob");
  const pdfUrl = URL.createObjectURL(pdfBlob);

  const previewWindow =
    window.open(pdfUrl, "_blank");

  if (!previewWindow) {
    URL.revokeObjectURL(pdfUrl);

    throw new Error(
      "PDF preview was blocked by the browser."
    );
  }

  window.setTimeout(() => {
    URL.revokeObjectURL(pdfUrl);
  }, 10 * 60 * 1000);

  return pdfUrl;
}
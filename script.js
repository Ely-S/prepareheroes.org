// Configuration
// Use relative URLs so this works in local dev + on any domain.
const WORKER_URL = '/api/submit_quiz'; // Cloudflare Pages Function route
const REDIRECT_URL = '/checkout.html';

const basePrices = {
    will: "$400",
    trustInd: "$1,500",
    trustCouple: "$1,600",
    trustUpdate: "$500"
};

const responderPrices = {
    will: "$0",
    trustInd: "$500",
    trustCouple: "$600",
    trustUpdate: "$350"
};

const pricing = {
    responder: {
        will: responderPrices.will,
        willBase: basePrices.will,
        trustInd: responderPrices.trustInd,
        trustIndBase: basePrices.trustInd,
        trustCouple: responderPrices.trustCouple,
        trustCoupleBase: basePrices.trustCouple,
        trustUpdate: responderPrices.trustUpdate,
        trustUpdateBase: basePrices.trustUpdate
    },
    civilian: {
        will: basePrices.will,
        willBase: "",
        trustInd: basePrices.trustInd,
        trustIndBase: "",
        trustCouple: basePrices.trustCouple,
        trustCoupleBase: "",
        trustUpdate: basePrices.trustUpdate,
        trustUpdateBase: ""
    }
};

function setCustomerType(type) {
    const options = document.querySelectorAll('.toggle-option');
    
    // Price Elements
    const pWill = document.getElementById('price-will');
    const pTrustInd = document.getElementById('price-trust-ind');
    const pTrustCouple = document.getElementById('price-trust-couple');
    const pTrustUpdate = document.getElementById('price-trust-update');

    // Base Price Elements (Strikethrough)
    const bWill = document.getElementById('base-will');
    const bTrustInd = document.getElementById('base-trust-ind');
    const bTrustCouple = document.getElementById('base-trust-couple');
    const bTrustUpdate = document.getElementById('base-trust-update');
    
    // Update toggle visuals
    options.forEach(opt => opt.classList.remove('active'));
    if (type === 'responder') {
        options[0].classList.add('active');
    } else {
        options[1].classList.add('active');
    }

    // Update prices with fade animation
    const elements = [pWill, pTrustInd, pTrustCouple, pTrustUpdate, bWill, bTrustInd, bTrustCouple, bTrustUpdate];
    elements.forEach(el => el.style.opacity = 0);

    setTimeout(() => {
        // Set Main Prices
        pWill.innerText = pricing[type].will;
        pTrustInd.innerText = pricing[type].trustInd;
        pTrustCouple.innerText = pricing[type].trustCouple;
        pTrustUpdate.innerText = pricing[type].trustUpdate;

        // Set Base Prices (Strikethrough)
        bWill.innerText = pricing[type].willBase;
        bTrustInd.innerText = pricing[type].trustIndBase;
        bTrustCouple.innerText = pricing[type].trustCoupleBase;
        bTrustUpdate.innerText = pricing[type].trustUpdateBase;

        elements.forEach(el => el.style.opacity = 1);
    }, 200);
}

// Initialize with base prices shown for responder default
window.onload = function() {
     setCustomerType('responder');

     // Add event listener for responder status changes
     const responderStatusSelect = document.getElementById('responderStatus');
     if (responderStatusSelect) {
         responderStatusSelect.addEventListener('change', toggleResponderFields);
     }
}

// Toggle DSW and Department fields based on responder status
function toggleResponderFields() {
    const responderStatus = document.getElementById('responderStatus').value;
    const responderFields = document.getElementById('responderFields');
    const dswInput = document.getElementById('dswNumber');
    const deptInput = document.getElementById('department');

    if (responderStatus === 'active' || responderStatus === 'retired') {
        // Show fields for first responders
        responderFields.style.display = 'grid';
        dswInput.setAttribute('required', 'required');
        deptInput.setAttribute('required', 'required');
    } else {
        // Hide fields for civilians or when nothing is selected
        responderFields.style.display = 'none';
        dswInput.removeAttribute('required');
        deptInput.removeAttribute('required');
        dswInput.value = '';
        deptInput.value = '';
        // Clear any errors
        clearError('dswNumber');
        clearError('department');
    }
}

// Validation Functions
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePhone(phone) {
    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');
    // Check if it's 10 or 11 digits (with or without country code)
    return cleaned.length === 10 || cleaned.length === 11;
}

function showError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorDiv = document.getElementById(fieldId + '-error');

    if (field && errorDiv) {
        field.classList.add('error');
        field.classList.remove('success');
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
    }
}

function clearError(fieldId) {
    const field = document.getElementById(fieldId);
    const errorDiv = document.getElementById(fieldId + '-error');

    if (field && errorDiv) {
        field.classList.remove('error');
        field.classList.add('success');
        errorDiv.textContent = '';
        errorDiv.classList.remove('show');
    }
}

function validateField(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return true;

    const value = field.value.trim();

    // Check if field is required
    if (field.hasAttribute('required') && !value) {
        showError(fieldId, 'This field is required');
        return false;
    }

    // Specific validations
    switch(fieldId) {
        case 'firstName':
        case 'lastName':
            if (value.length < 2) {
                showError(fieldId, 'Name must be at least 2 characters');
                return false;
            }
            break;

        case 'email':
            if (!validateEmail(value)) {
                showError(fieldId, 'Please enter a valid email address');
                return false;
            }
            break;

        case 'phone':
            if (!validatePhone(value)) {
                showError(fieldId, 'Please enter a valid 10-digit phone number');
                return false;
            }
            break;

        case 'dependants':
            if (parseInt(value) < 0) {
                showError(fieldId, 'Number cannot be negative');
                return false;
            }
            break;
    }

    clearError(fieldId);
    return true;
}

function validateForm() {
    const fields = [
        'firstName', 'lastName', 'email', 'phone',
        'responderStatus', 'maritalStatus', 'dependants', 'referredBy'
    ];

    // Add DSW and Department if first responder
    const responderStatus = document.getElementById('responderStatus').value;
    if (responderStatus === 'active' || responderStatus === 'retired') {
        fields.push('dswNumber', 'department');
    }

    let isValid = true;
    fields.forEach(fieldId => {
        if (!validateField(fieldId)) {
            isValid = false;
        }
    });

    // Check radio buttons
    const radioGroups = ['realEstate', 'lifeInsurance', 'existingTrust'];
    radioGroups.forEach(groupName => {
        const checked = document.querySelector(`input[name="${groupName}"]:checked`);
        if (!checked) {
            isValid = false;
            // Could add visual indication for radio groups here
        }
    });

    return isValid;
}

// Add real-time validation
function setupFormValidation() {
    const form = document.getElementById('questionnaireForm');
    if (!form) return;

    const inputs = form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], select');

    inputs.forEach(input => {
        input.addEventListener('blur', function() {
            validateField(this.id);
        });

        input.addEventListener('input', function() {
            // Clear error on input if field was previously invalid
            if (this.classList.contains('error')) {
                validateField(this.id);
            }
        });
    });
}

// Questionnaire Modal Functions
function openQuestionnaire(packageType) {
    const modal = document.getElementById('questionnaireModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling

    // Reset modal state - show form, hide recommendations (in case reopened without full reset)
    const formSection = document.getElementById('questionnaireFormSection');
    const recSection = document.getElementById('recommendationsSection');
    if (formSection) formSection.style.display = 'block';
    if (recSection) recSection.classList.remove('active');

    // Track what the user clicked to open the modal (not their final choice).
    sessionStorage.setItem('entryPackage', packageType || 'will');
    // Clear any previous final selection; it will be set when they choose in recommendations.
    sessionStorage.removeItem('selectedPackage');

    // Setup form validation
    setTimeout(() => {
        setupFormValidation();
    }, 100);
}

function closeQuestionnaire() {
    const modal = document.getElementById('questionnaireModal');
    modal.classList.remove('active');
    document.body.style.overflow = ''; // Restore scrolling

    // Reset modal state - show form, hide recommendations
    setTimeout(() => {
        document.getElementById('questionnaireFormSection').style.display = 'block';
        document.getElementById('recommendationsSection').classList.remove('active');
        document.getElementById('questionnaireForm').reset();

        // Clear all validation errors
        const allInputs = document.querySelectorAll('#questionnaireForm input, #questionnaireForm select');
        allInputs.forEach(input => {
            input.classList.remove('error', 'success');
        });
        const allErrors = document.querySelectorAll('.error-message');
        allErrors.forEach(error => {
            error.classList.remove('show');
            error.textContent = '';
        });
    }, 300); // Wait for modal close animation
}

// If we land on the homepage with ?package=... (e.g. from /payment free option),
// auto-open the questionnaire for that package.
function maybeAutoOpenQuestionnaireFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const pkg = params.get('package');
    if (!pkg) return;

    // Only accept known packages
    const allowed = ['will', 'trust-individual', 'trust-couple', 'trust-update'];
    if (!allowed.includes(pkg)) return;

    // Remove the query param from the URL so refreshes don't keep reopening
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete('package');
        window.history.replaceState({}, '', url.toString());
    } catch (_) {
        // no-op
    }

    openQuestionnaire(pkg);
}

async function submitQuestionnaire(event) {
    event.preventDefault();

    // Validate form before submission
    if (!validateForm()) {
        // Scroll to first error
        const firstError = document.querySelector('.error');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return false;
    }

    // Collect form data
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());

    // Include entry package for analytics/context (not the final selection).
    data.entryPackage = sessionStorage.getItem('entryPackage') || 'will';

    // Store user data for later use
    sessionStorage.setItem('userData', JSON.stringify(data));

    // Show loading state
    const submitButton = event.target.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = 'Calculating...';

    try {
        // Compute recommendation and show choices.
        const recommendation = getRecommendation(data);
        sessionStorage.setItem('recommendedPackage', recommendation.package);
        sessionStorage.setItem('recommendationReason', recommendation.reason || '');

        showRecommendations(recommendation, data);

        // Swap UI from form to recommendations.
        const formSection = document.getElementById('questionnaireFormSection');
        const recSection = document.getElementById('recommendationsSection');
        if (formSection) formSection.style.display = 'none';
        if (recSection) recSection.classList.add('active');

        // Ensure the modal scroll is at the top so users see the recommendation.
        const modalContent = document.querySelector('#questionnaireModal .modal-content');
        if (modalContent) modalContent.scrollTop = 0;
    } catch (error) {
        console.error('Error generating recommendation:', error);
        alert('There was an error generating your recommendation. Please try again.');
    }

    // Restore button state (even though we hide the form on success, this helps if anything fails).
    submitButton.disabled = false;
    submitButton.innerHTML = originalButtonText;
}

function getRecommendation(data) {
    const hasExistingTrust = data.existingTrust === 'yes';
    const hasDependants = parseInt(data.dependants) > 0;
    const hasRealEstate = data.realEstate === 'yes';
    const hasSpouse = data.maritalStatus === 'married' || data.maritalStatus === 'domestic-partnership';
    const needsTrust = hasDependants || hasRealEstate;

    let recommended = 'will';
    let reason = '';

    if (hasExistingTrust) {
        recommended = 'trust-update';
        reason = 'You mentioned you have an existing trust. Updating it will ensure it reflects your current wishes and includes all your assets.';
    } else if (needsTrust && hasSpouse) {
        recommended = 'trust-couple';
        reason = '';
        if (hasDependants && hasRealEstate) {
            reason = 'With dependants and real estate in California, a Couples Trust protects your family and avoids the costly probate process for both you and your spouse.';
        } else if (hasDependants) {
            reason = 'As parents, a Couples Trust ensures your children are protected and your spouse can manage assets seamlessly without court intervention.';
        } else if (hasRealEstate) {
            reason = 'Your California real estate makes a Couples Trust essential to avoid probate fees that can exceed $50,000 on a median SF home.';
        }
    } else if (needsTrust) {
        recommended = 'trust-individual';
        reason = '';
        if (hasDependants && hasRealEstate) {
            reason = 'With dependants and real estate, a Living Trust protects your children and avoids the costly probate process in California.';
        } else if (hasDependants) {
            reason = 'As a parent, a Trust ensures your children are protected and your assets pass to them quickly without court delays.';
        } else if (hasRealEstate) {
            reason = 'Your California real estate makes a Trust essential to avoid probate fees that can exceed $50,000 on a median SF home.';
        }
    } else {
        recommended = 'will';
        reason = 'A Will is perfect for your situation. It ensures your wishes are documented and legally binding.';
    }

    return { package: recommended, reason: reason };
}

function showRecommendations(recommendation, userData) {
    const customerType = userData.responderStatus === 'civilian' ? 'civilian' : 'responder';
    const recommendedDiv = document.getElementById('recommendedPackage');
    const otherDiv = document.getElementById('otherPackages');

    // Get package details
    const packages = {
        'will': {
            name: 'Will Package',
            price: pricing[customerType].will,
            basePrice: pricing[customerType].willBase,
            features: [
                'Last Will & Testament',
                'Durable Power of Attorney',
                'Advance Health Care Directive',
                'HIPAA Authorization'
            ]
        },
        'trust-individual': {
            name: 'Trust (Individual)',
            price: pricing[customerType].trustInd,
            basePrice: pricing[customerType].trustIndBase,
            features: [
                '<strong>Everything in Will Package</strong>',
                'Revocable Living Trust',
                'Transfer Deed for Home (CA)',
                'Privacy Protection',
                'Avoids Probate Court'
            ]
        },
        'trust-couple': {
            name: 'Trust (Couples)',
            price: pricing[customerType].trustCouple,
            basePrice: pricing[customerType].trustCoupleBase,
            features: [
                '<strong>Joint Couple\'s Trusts</strong>',
                'Mirror Wills for Both',
                'Joint Asset Protection',
                'Spousal Provisions',
                'Complete Family Protection'
            ]
        },
        'trust-update': {
            name: 'Update Existing Trust',
            price: pricing[customerType].trustUpdate,
            basePrice: pricing[customerType].trustUpdateBase,
            features: [
                '<strong>Everything in Will Package</strong>',
                'Use existing trust as starting point',
                'Update assets and beneficiaries',
                'Free updates anytime'
            ]
        }
    };

    // Show recommended package
    const recPkg = packages[recommendation.package];
    recommendedDiv.innerHTML = `
        <div class="rec-card recommended">
            <div class="recommendation-badge">⭐ Recommended For You</div>
            <h3>${recPkg.name}</h3>
            ${recPkg.basePrice ? `<div class="strike" style="color: var(--text-light); font-size: 1.2rem;">${recPkg.basePrice}</div>` : ''}
            <div class="rec-price">${recPkg.price}</div>
            ${recommendation.reason ? `
            <div class="why-recommended">
                <strong>Why we recommend this:</strong>
                ${recommendation.reason}
            </div>` : ''}
            <ul class="rec-features">
                ${recPkg.features.map(f => `<li><span class="icon-check" style="color: var(--accent-color);">✓</span> ${f}</li>`).join('')}
            </ul>
            <button class="btn btn-primary btn-block" onclick="selectPackage('${recommendation.package}')">Choose This Package</button>
        </div>
    `;

    // Show other packages (always include Will)
    const otherPackages = Object.keys(packages).filter(key => key !== recommendation.package);

    // Always show Will package if not recommended
    if (recommendation.package !== 'will' && !otherPackages.includes('will')) {
        otherPackages.unshift('will');
    }

    otherDiv.innerHTML = otherPackages.map(key => {
        const pkg = packages[key];
        return `
            <div class="rec-card">
                <h3>${pkg.name}</h3>
                ${pkg.basePrice ? `<div class="strike" style="color: var(--text-light); font-size: 1.2rem;">${pkg.basePrice}</div>` : ''}
                <div class="rec-price">${pkg.price}</div>
                <ul class="rec-features">
                    ${pkg.features.map(f => `<li><span class="icon-check" style="color: var(--accent-color);">✓</span> ${f}</li>`).join('')}
                </ul>
                <button class="btn btn-primary btn-block" onclick="selectPackage('${key}')">Choose This Package</button>
            </div>
        `;
    }).join('');
}

async function selectPackage(packageType) {
    // Store selected package immediately (for continuity across pages)
    sessionStorage.setItem('selectedPackage', packageType);

    const userDataRaw = sessionStorage.getItem('userData');
    if (!userDataRaw) {
        alert('Please complete the questionnaire first.');
        return;
    }

    let userData;
    try {
        userData = JSON.parse(userDataRaw) || {};
    } catch (e) {
        console.error('Failed to parse stored userData:', e);
        alert('Something went wrong. Please reopen the questionnaire and try again.');
        return;
    }

    // Save customer type for tracking/context.
    const customerType = userData.responderStatus === 'civilian' ? 'civilian' : 'responder';
    sessionStorage.setItem('customerType', customerType);

    // Build payload for server: save their final choice.
    const recommendation = getRecommendation(userData);
    const payload = {
        ...userData,
        selectedPackage: packageType,
        recommendedPackage: recommendation.package,
        recommendationReason: recommendation.reason || ''
    };

    // Disable all choice buttons to prevent double-submits.
    const buttons = Array.from(document.querySelectorAll('#recommendationsSection button'));
    const originalTexts = buttons.map(b => b.innerHTML);
    buttons.forEach(b => {
        b.disabled = true;
        b.innerHTML = 'Saving...';
    });

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.success) {
            throw new Error(result?.error || `Failed to save selection (${response.status})`);
        }

        // Persist opportunity id for debugging / later use if needed.
        if (result?.opportunityId) {
            sessionStorage.setItem('opportunityId', String(result.opportunityId));
        }

        // Redirect to the server-provided checkout link when available.
        // Fallback to the local checkout page if the API didn't return one.
        const redirectTarget = result?.checkoutLink || REDIRECT_URL;
        const redirectUrl = new URL(redirectTarget, window.location.origin);
        redirectUrl.searchParams.set('chosenPackage', packageType);
        redirectUrl.searchParams.set('customerType', customerType);
        if (userData.email) {
            redirectUrl.searchParams.set('email', userData.email);
        }
        window.location.href = redirectUrl.toString();
    } catch (error) {
        console.error('Error saving selection:', error);
        alert('There was an error saving your selection. Please try again.');
        // Restore button state so they can retry.
        buttons.forEach((b, idx) => {
            b.disabled = false;
            b.innerHTML = originalTexts[idx] || 'Choose This Package';
        });
    }
}

// Close modal when clicking outside of it
document.getElementById('questionnaireModal').addEventListener('click', function(event) {
    if (event.target === this) {
        closeQuestionnaire();
    }
});

// Close modal on Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeQuestionnaire();
    }
});

// Auto-open from URL (runs after onload setCustomerType initializer)
window.addEventListener('load', function() {
    maybeAutoOpenQuestionnaireFromUrl();
});

